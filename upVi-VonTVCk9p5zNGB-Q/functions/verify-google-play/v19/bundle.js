// =============================================================================
// verify-google-play
// =============================================================================
// Google Play subscription verification Edge Function
//
// Fixes in this version:
//   * 502 GATEWAY TIMEOUT -> every outbound request (Google OAuth, Google Play
//     API, database) now has a hard AbortController timeout, and the whole
//     handler runs behind a global deadline so we ALWAYS return JSON instead of
//     letting the gateway time out.
//   * ReferenceError -> saveSubscription() was called with undefined variables
//     (purchaseDate / expiryDate). It now uses the computed period values.
//   * Database write is a single upsert (subscriptions.user_id is UNIQUE)
//     instead of SELECT + UPDATE/INSERT, halving the DB round trips.
//   * Verbose step-by-step logs with elapsed milliseconds so the exact hang /
//     failure point is visible in the function logs.
// =============================================================================


// =============================================================================
// TIMEOUT BUDGET (must stay well under the gateway limit)
// =============================================================================

const GLOBAL_DEADLINE_MS = 20000; // whole request
const OAUTH_TIMEOUT_MS = 7000; // google oauth token
const PLAY_TIMEOUT_MS = 7000; // google play api call
const DB_TIMEOUT_MS = 7000; // database call


// =============================================================================
// ENVIRONMENT
// =============================================================================

function getEnv(key) {
  try {
    const g = globalThis;

    if (g.Deno && g.Deno.env && g.Deno.env.get) {
      const value = g.Deno.env.get(key);
      if (typeof value === "string") return value.trim();
    }

    if (g.process && g.process.env && typeof g.process.env[key] === "string") {
      return g.process.env[key].trim();
    }
  } catch (_) {
    // ignore
  }

  return "";
}


// =============================================================================
// CONFIG
// =============================================================================

const PROJECT_URL = "https://erbligiwkdfwxkhvwepw.databasepad.com";

const REST_URL = `${PROJECT_URL}/rest/v1`;

const DB_KEY =
  getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
  getEnv("SERVICE_ROLE_KEY") ||
  getEnv("SUPABASE_ANON_KEY") ||
  getEnv("ANON_KEY");

const GOOGLE_PACKAGE_NAME =
  getEnv("GOOGLE_PLAY_PACKAGE_NAME") || "com.fishingfinderusa";

const GOOGLE_PUBLISHER_BASE =
  "https://androidpublisher.googleapis.com/androidpublisher/v3";

const GOOGLE_OAUTH_URL = "https://oauth2.googleapis.com/token";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


// =============================================================================
// LOGGING
// =============================================================================

let LOG_START = Date.now();
let LOG_REQUEST_ID = "boot";

function elapsed() {
  return `${Date.now() - LOG_START}ms`;
}

function log(message, data) {
  const prefix = `[verify-google-play][${LOG_REQUEST_ID}][+${elapsed()}]`;

  if (data !== undefined) {
    let printable = data;

    try {
      printable =
        typeof data === "string" ? data : JSON.stringify(data);
    } catch (_) {
      printable = String(data);
    }

    console.log(`${prefix} ${message} :: ${printable}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

function logError(message, error) {
  const prefix = `[verify-google-play][${LOG_REQUEST_ID}][+${elapsed()}]`;

  console.error(
    `${prefix} ERROR ${message} :: ${
      error instanceof Error ? error.message : String(error)
    }`
  );

  if (error instanceof Error && error.stack) {
    console.error(`${prefix} STACK :: ${error.stack}`);
  }
}


// =============================================================================
// RESPONSE
// =============================================================================

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


// =============================================================================
// FETCH WITH HARD TIMEOUT (prevents the 502 gateway timeout)
// =============================================================================

async function fetchWithTimeout(label, url, options, timeoutMs) {
  const controller = new AbortController();
  const startedAt = Date.now();

  const timer = setTimeout(() => {
    log(`${label} ABORTING after ${timeoutMs}ms`);
    controller.abort();
  }, timeoutMs);

  log(`${label} request START`, {
    method: (options && options.method) || "GET",
    timeoutMs,
  });

  try {
    const response = await fetch(url, {
      ...(options || {}),
      signal: controller.signal,
    });

    const text = await response.text();

    log(`${label} request DONE`, {
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      bodyBytes: text ? text.length : 0,
    });

    let body = {};

    try {
      body = text ? JSON.parse(text) : {};
    } catch (_) {
      body = { raw: text };
    }

    return { ok: response.ok, status: response.status, body, text };
  } catch (error) {
    if (error && error.name === "AbortError") {
      logError(
        `${label} TIMED OUT after ${timeoutMs}ms (durationMs=${
          Date.now() - startedAt
        })`,
        error
      );

      throw new Error(`${label} timed out after ${timeoutMs}ms.`);
    }

    logError(`${label} network failure`, error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}


// =============================================================================
// DATABASE
// =============================================================================

function dbHeaders(extra) {
  return {
    apikey: DB_KEY,
    Authorization: `Bearer ${DB_KEY}`,
    "Content-Type": "application/json",
    ...(extra || {}),
  };
}


// =============================================================================
// HELPERS
// =============================================================================

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim()
    )
  );
}

function planFromProductId(productId) {
  if (!productId) return "monthly";
  if (/year|annual/i.test(productId)) return "yearly";
  return "monthly";
}


// =============================================================================
// BASE64 HELPERS
// =============================================================================

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...Array.from(bytes.subarray(i, i + chunkSize))
    );
  }

  return btoa(binary);
}

function base64UrlFromBytes(bytes) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlFromString(value) {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function pemToPkcs8Bytes(pem) {
  const normalized = String(pem).replace(/\\n/g, "\n").trim();

  const body = normalized
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  if (!body) {
    throw new Error("Google private_key is empty or malformed.");
  }

  return base64ToBytes(body);
}

function parseServiceAccount(rawValue) {
  // Accept raw JSON or base64-encoded JSON.
  try {
    return JSON.parse(rawValue);
  } catch (_) {
    try {
      return JSON.parse(atob(rawValue));
    } catch (_err) {
      throw new Error(
        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON (or base64 JSON)."
      );
    }
  }
}


// =============================================================================
// GOOGLE ACCESS TOKEN
// =============================================================================

let cachedToken = null;

async function getGoogleAccessToken() {
  log("STEP 1: resolve Google OAuth access token");

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    log("STEP 1: using CACHED Google access token", {
      expiresInMs: cachedToken.expiresAt - Date.now(),
    });

    return cachedToken.token;
  }

  const serviceAccountJson = getEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");

  if (!serviceAccountJson) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured.");
  }

  const credentials = parseServiceAccount(serviceAccountJson);

  const clientEmail = credentials.client_email;
  const privateKey = credentials.private_key;

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Google service account is missing client_email or private_key."
    );
  }

  log("STEP 1: service account loaded", {
    clientEmail,
    projectId: credentials.project_id || null,
    privateKeyChars: String(privateKey).length,
  });

  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlFromString(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  );

  const payload = base64UrlFromString(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: GOOGLE_OAUTH_URL,
      iat: now,
      exp: now + 3600,
    })
  );

  const signingInput = `${header}.${payload}`;

  log("STEP 2: importing RSA private key");

  let cryptoKey;

  try {
    cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8Bytes(privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
  } catch (error) {
    logError("STEP 2: private key import FAILED", error);

    throw new Error(
      "Unable to import Google service account private key: " +
        (error instanceof Error ? error.message : String(error))
    );
  }

  log("STEP 2: signing JWT");

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64UrlFromBytes(
    new Uint8Array(signatureBuffer)
  )}`;

  log("STEP 3: exchanging JWT for Google access token");

  const result = await fetchWithTimeout(
    "google-oauth",
    GOOGLE_OAUTH_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    },
    OAUTH_TIMEOUT_MS
  );

  const data = result.body || {};

  if (!result.ok || !data.access_token) {
    logError(
      "STEP 3: Google OAuth FAILED",
      new Error(
        `${result.status} ${data.error || ""} ${data.error_description || ""}`
      )
    );

    throw new Error(
      data.error_description ||
        data.error ||
        `Google OAuth failed with HTTP ${result.status}.`
    );
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };

  log("STEP 3: Google access token acquired", {
    expiresInSeconds: Number(data.expires_in || 3600),
  });

  return cachedToken.token;
}


// =============================================================================
// GOOGLE PLAY API
// =============================================================================

function playFetch(label, url, accessToken, options) {
  return fetchWithTimeout(
    label,
    url,
    {
      method: (options && options.method) || "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: options && options.body,
    },
    PLAY_TIMEOUT_MS
  );
}


// =============================================================================
// NORMALIZE V2
// =============================================================================

function normalizeV2(raw, fallbackProductId) {
  const line =
    raw && Array.isArray(raw.lineItems) && raw.lineItems.length > 0
      ? raw.lineItems[0]
      : null;

  const expiry = line && line.expiryTime ? Date.parse(line.expiryTime) : 0;
  const start = raw && raw.startTime ? Date.parse(raw.startTime) : 0;

  const state = String((raw && raw.subscriptionState) || "");

  const activeStates = [
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_CANCELED",
  ];

  return {
    apiVersion: "v2",
    active: activeStates.includes(state) && expiry > Date.now(),
    state,
    expiryTimeMillis: expiry || 0,
    startTimeMillis: start || 0,
    autoRenewing: !!(
      line &&
      line.autoRenewingPlan &&
      line.autoRenewingPlan.autoRenewEnabled
    ),
    productId: (line && line.productId) || fallbackProductId || null,
    acknowledged:
      String((raw && raw.acknowledgementState) || "") ===
      "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    raw,
  };
}


// =============================================================================
// NORMALIZE V1
// =============================================================================

function normalizeV1(raw, productId) {
  const expiry = Number((raw && raw.expiryTimeMillis) || 0);
  const start = Number((raw && raw.startTimeMillis) || 0);

  const paymentState =
    raw && raw.paymentState !== undefined ? Number(raw.paymentState) : 1;

  return {
    apiVersion: "v1",
    active: expiry > Date.now() && [1, 2, 3].includes(paymentState),
    state: `paymentState:${paymentState}`,
    expiryTimeMillis: expiry,
    startTimeMillis: start,
    autoRenewing: !!(raw && raw.autoRenewing),
    productId: productId || null,
    acknowledged:
      Number(
        raw && raw.acknowledgementState !== undefined
          ? raw.acknowledgementState
          : 1
      ) === 1,
    raw,
  };
}


// =============================================================================
// ACKNOWLEDGE
// =============================================================================

async function acknowledgePurchase(
  accessToken,
  packageName,
  productId,
  purchaseToken
) {
  const url =
    `${GOOGLE_PUBLISHER_BASE}` +
    `/applications/${encodeURIComponent(packageName)}` +
    `/purchases/subscriptions/${encodeURIComponent(productId)}` +
    `/tokens/${encodeURIComponent(purchaseToken)}` +
    `:acknowledge`;

  log("Acknowledging Google Play purchase", { packageName, productId });

  const result = await playFetch("google-acknowledge", url, accessToken, {
    method: "POST",
    body: JSON.stringify({}),
  });

  if (!result.ok) {
    throw new Error(
      (result.body && result.body.error && result.body.error.message) ||
        `Google acknowledgement failed with HTTP ${result.status}.`
    );
  }

  log("Google Play purchase acknowledged");
  return true;
}


// =============================================================================
// VERIFY GOOGLE PLAY PURCHASE
// =============================================================================

async function verifyGooglePlayPurchase(packageName, productId, purchaseToken) {
  const accessToken = await getGoogleAccessToken();

  const pkg = encodeURIComponent(packageName);
  const token = encodeURIComponent(purchaseToken);

  // ---------------------------------------------------------------------------
  // V2
  // ---------------------------------------------------------------------------

  log("STEP 4: calling Google purchases.subscriptionsv2", { packageName });

  const v2 = await playFetch(
    "google-subscriptionsv2",
    `${GOOGLE_PUBLISHER_BASE}/applications/${pkg}/purchases/subscriptionsv2/tokens/${token}`,
    accessToken
  );

  if (v2.ok) {
    const purchase = normalizeV2(v2.body, productId);

    log("STEP 4: V2 purchase normalized", {
      active: purchase.active,
      state: purchase.state,
      productId: purchase.productId,
      expiryTimeMillis: purchase.expiryTimeMillis,
      acknowledged: purchase.acknowledged,
      autoRenewing: purchase.autoRenewing,
    });

    if (purchase.active && !purchase.acknowledged) {
      try {
        await acknowledgePurchase(
          accessToken,
          packageName,
          purchase.productId || productId,
          purchaseToken
        );

        purchase.acknowledged = true;
      } catch (error) {
        logError("Acknowledgement failed (continuing)", error);
      }
    }

    return purchase;
  }

  log("STEP 4: V2 failed, falling back to V1", {
    status: v2.status,
    message:
      (v2.body && v2.body.error && v2.body.error.message) || null,
  });

  // ---------------------------------------------------------------------------
  // V1 FALLBACK
  // ---------------------------------------------------------------------------

  log("STEP 5: calling Google purchases.subscriptions (legacy)");

  const v1 = await playFetch(
    "google-subscriptions-v1",
    `${GOOGLE_PUBLISHER_BASE}/applications/${pkg}/purchases/subscriptions/${encodeURIComponent(
      productId
    )}/tokens/${token}`,
    accessToken
  );

  if (v1.ok) {
    const purchase = normalizeV1(v1.body, productId);

    log("STEP 5: V1 purchase normalized", {
      active: purchase.active,
      state: purchase.state,
      productId: purchase.productId,
      expiryTimeMillis: purchase.expiryTimeMillis,
      acknowledged: purchase.acknowledged,
      autoRenewing: purchase.autoRenewing,
    });

    if (purchase.active && !purchase.acknowledged) {
      try {
        await acknowledgePurchase(
          accessToken,
          packageName,
          purchase.productId || productId,
          purchaseToken
        );

        purchase.acknowledged = true;
      } catch (error) {
        logError("V1 acknowledgement failed (continuing)", error);
      }
    }

    return purchase;
  }

  const v2Message =
    (v2.body && v2.body.error && v2.body.error.message) || null;

  const v1Message =
    (v1.body && v1.body.error && v1.body.error.message) || null;

  throw new Error(
    v1Message ||
      v2Message ||
      `Google Play verification failed. V2=${v2.status}, V1=${v1.status}`
  );
}


// =============================================================================
// SAVE SUBSCRIPTION (single upsert - subscriptions.user_id is UNIQUE)
// =============================================================================

async function saveSubscription(userId, fields) {
  log("STEP 6: saving subscription row", { userId, fields });

  const row = { user_id: userId, ...fields };

  const upsert = await fetchWithTimeout(
    "db-upsert-subscription",
    `${REST_URL}/subscriptions?on_conflict=user_id`,
    {
      method: "POST",
      headers: dbHeaders({
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify(row),
    },
    DB_TIMEOUT_MS
  );

  if (upsert.ok) {
    const rows = Array.isArray(upsert.body) ? upsert.body : [];

    log("STEP 6: subscription UPSERT successful", {
      rowsReturned: rows.length,
      status: rows[0] ? rows[0].status : null,
      plan: rows[0] ? rows[0].plan : null,
    });

    return rows[0] || null;
  }

  log("STEP 6: upsert failed, falling back to PATCH", {
    status: upsert.status,
    body: upsert.text ? upsert.text.slice(0, 500) : "",
  });

  const patch = await fetchWithTimeout(
    "db-patch-subscription",
    `${REST_URL}/subscriptions?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: dbHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify(fields),
    },
    DB_TIMEOUT_MS
  );

  if (!patch.ok) {
    throw new Error(
      `Subscription save failed. upsert=HTTP ${upsert.status} ${
        upsert.text ? upsert.text.slice(0, 300) : ""
      } | patch=HTTP ${patch.status} ${
        patch.text ? patch.text.slice(0, 300) : ""
      }`
    );
  }

  const patched = Array.isArray(patch.body) ? patch.body : [];

  log("STEP 6: subscription PATCH successful", {
    rowsUpdated: patched.length,
  });

  return patched[0] || null;
}


// =============================================================================
// CORE WORK
// =============================================================================

async function handleVerification(body) {
  // ---------------------------------------------------------------------------
  // PLATFORM
  // ---------------------------------------------------------------------------

  const platform = String((body && body.platform) || "google_play");

  if (!["google_play", "android", "google"].includes(platform)) {
    return json(
      { success: false, message: `Unsupported platform: ${platform}` },
      400
    );
  }

  const packageName =
    (body && (body.packageName || body.package_name)) || GOOGLE_PACKAGE_NAME;

  const productId = body && (body.productId || body.product_id);

  const purchaseToken =
    body && (body.purchaseToken || body.purchase_token || body.token);

  const userId = body && (body.userId || body.user_id);

  // ---------------------------------------------------------------------------
  // VALIDATION
  // ---------------------------------------------------------------------------

  if (!packageName || !productId || !purchaseToken) {
    log("VALIDATION FAILED: missing purchase data", {
      packageName: !!packageName,
      productId: !!productId,
      purchaseToken: !!purchaseToken,
    });

    return json(
      {
        success: false,
        message: "packageName, productId and purchaseToken are required.",
        received: {
          packageName: !!packageName,
          productId: !!productId,
          purchaseToken: !!purchaseToken,
        },
      },
      400
    );
  }

  if (!isUuid(userId)) {
    log("VALIDATION FAILED: invalid userId", { userId: userId || null });

    return json(
      { success: false, message: "A valid userId UUID is required." },
      400
    );
  }

  log("Validation OK", {
    packageName,
    productId,
    userId,
    purchaseTokenChars: String(purchaseToken).length,
  });

  // ---------------------------------------------------------------------------
  // GOOGLE VERIFICATION
  // ---------------------------------------------------------------------------

  const purchase = await verifyGooglePlayPurchase(
    packageName,
    productId,
    purchaseToken
  );

  log("STEP 7: Google verification complete", {
    apiVersion: purchase.apiVersion,
    active: purchase.active,
    state: purchase.state,
  });

  // ---------------------------------------------------------------------------
  // SUBSCRIPTION VALUES
  // ---------------------------------------------------------------------------

  const status = purchase.active ? "active" : "expired";

  const plan = purchase.active
    ? planFromProductId(purchase.productId || productId)
    : "free";

  const currentPeriodEnd =
    purchase.expiryTimeMillis > 0
      ? new Date(purchase.expiryTimeMillis).toISOString()
      : null;

  const currentPeriodStart =
    purchase.startTimeMillis > 0
      ? new Date(purchase.startTimeMillis).toISOString()
      : new Date().toISOString();

  // ---------------------------------------------------------------------------
  // SAVE  (previously referenced undefined purchaseDate / expiryDate)
  // ---------------------------------------------------------------------------

  const subscription = await saveSubscription(userId, {
    status,
    plan,
    provider: "google_play",
    platform: "android",
    product_id: purchase.productId || productId,
    purchase_token: String(purchaseToken),
    auto_renewing: !!purchase.autoRenewing,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    raw_receipt: purchase.raw || null,
    updated_at: new Date().toISOString(),
  });

  log("SUCCESS", {
    active: purchase.active,
    status,
    plan,
    productId: purchase.productId || productId,
    current_period_end: currentPeriodEnd,
    savedRowId: subscription ? subscription.id : null,
  });

  return json({
    success: true,
    active: purchase.active,
    userId,
    status,
    plan,
    productId: purchase.productId || productId,
    apiVersion: purchase.apiVersion,
    subscriptionState: purchase.state,
    autoRenewing: purchase.autoRenewing,
    acknowledged: purchase.acknowledged,
    expiryTimeMillis: purchase.expiryTimeMillis,
    current_period_end: currentPeriodEnd,
    provider: "google_play",
    subscription,
    message: purchase.active
      ? "Google Play purchase verified and subscription activated."
      : "Google Play purchase verified but subscription is not active.",
    requestId: LOG_REQUEST_ID,
  });
}


// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  LOG_START = Date.now();

  try {
    LOG_REQUEST_ID = crypto.randomUUID().slice(0, 8);
  } catch (_) {
    LOG_REQUEST_ID = String(Date.now());
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  log("REQUEST START", { method: req.method });

  let deadlineTimer = null;

  try {
    if (!DB_KEY) {
      logError(
        "Database API key missing",
        new Error("SUPABASE_SERVICE_ROLE_KEY / ANON_KEY not set")
      );

      return json(
        { success: false, message: "Database API key is not configured.", requestId: LOG_REQUEST_ID },
        500
      );
    }

    let body;

    try {
      body = await req.json();
    } catch (_) {
      log("Invalid JSON body");

      return json(
        { success: false, message: "Invalid JSON request body.", requestId: LOG_REQUEST_ID },
        400
      );
    }

    log("Body received", {
      platform: body && body.platform,
      productId: body && (body.productId || body.product_id),
      packageName: body && (body.packageName || body.package_name),
      userId: body && (body.userId || body.user_id),
      hasPurchaseToken: !!(
        body &&
        (body.purchaseToken || body.purchase_token || body.token)
      ),
    });

    // -------------------------------------------------------------------------
    // GLOBAL DEADLINE -> always answer before the gateway gives up (502)
    // -------------------------------------------------------------------------

    const deadline = new Promise((_resolve, reject) => {
      deadlineTimer = setTimeout(() => {
        reject(
          new Error(
            `Verification exceeded the ${GLOBAL_DEADLINE_MS}ms deadline. See logs for the last completed step.`
          )
        );
      }, GLOBAL_DEADLINE_MS);
    });

    const response = await Promise.race([handleVerification(body), deadline]);

    return response;
  } catch (error) {
    logError("REQUEST FAILED", error);

    const message = error instanceof Error ? error.message : String(error);

    const timedOut = /timed out|deadline/i.test(message);

    return json(
      {
        success: false,
        timeout: timedOut,
        message,
        requestId: LOG_REQUEST_ID,
      },
      timedOut ? 504 : 500
    );
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);

    log("REQUEST END");
  }
});
