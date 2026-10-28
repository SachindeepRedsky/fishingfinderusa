// =============================================================================
// verify-google-play
// =============================================================================
// Verifies a Google Play purchase token and writes the result into the
// `subscriptions` table.
//
// WHY IT RETURNED 502 / 504 BEFORE
// -----------------------------------------------------------------------------
// 1. This runtime CRASHES inside atob()/btoa() (verified with a staged probe:
//    env read + JSON.parse succeed, the very next call that used atob() killed
//    the isolate -> nginx replied "502 Bad Gateway" / "504 Gateway Time-out"
//    and no logs were ever flushed). All base64 work is now done with pure JS
//    helpers below - no atob/btoa anywhere.
// 2. There was no overall time limit: OAuth (7s) + Play v2 (15s) + Play v1
//    (15s) could run ~37s, longer than the gateway allows. Every request now
//    runs inside a strict budget and always answers with JSON.
// 3. saveSubscription() referenced undefined variables (purchaseDate /
//    expiryDate) -> ReferenceError, so the subscriptions row was never written.
//
// LOGGING: every step logs elapsed ms + remaining budget, prefixed with a short
// request id, so the exact failure point is visible in the function logs.
// Send {"action":"diag"} to test Google + database connectivity only.
// =============================================================================


// ---------------------------------------------------------------------------
// TIME BUDGET
// ---------------------------------------------------------------------------

const GLOBAL_DEADLINE_MS = 8000;
const MAX_GOOGLE_CALL_MS = 2500;
const DB_RESERVE_MS = 2000;
const MIN_CALL_MS = 600;


// ---------------------------------------------------------------------------
// PURE JS BASE64  (atob / btoa crash this runtime - never use them)
// ---------------------------------------------------------------------------

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBase64(bytes) {
  let out = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;

    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64_CHARS[b2 & 63] : "=";
  }

  return out;
}

function decodeBase64(value) {
  const clean = String(value).replace(/[^A-Za-z0-9+/]/g, "");
  const len = clean.length;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));

  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < len; i++) {
    const code = B64_CHARS.indexOf(clean[i]);
    if (code < 0) continue;

    buffer = (buffer << 6) | code;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex++] = (buffer >> bits) & 0xff;
    }
  }

  return bytes.subarray(0, byteIndex);
}

function b64url(bytes) {
  return encodeBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlString(value) {
  return b64url(new TextEncoder().encode(value));
}


// ---------------------------------------------------------------------------
// ENV / CONFIG
// ---------------------------------------------------------------------------

function getEnv(key) {
  try {
    const g = globalThis;

    if (g.Deno && g.Deno.env && g.Deno.env.get) {
      const v = g.Deno.env.get(key);
      if (typeof v === "string") return v.trim();
    }

    if (g.process && g.process.env && typeof g.process.env[key] === "string") {
      return g.process.env[key].trim();
    }
  } catch (_) {
    // ignore
  }

  return "";
}

const REST_URL = "https://erbligiwkdfwxkhvwepw.databasepad.com/rest/v1";

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


// ---------------------------------------------------------------------------
// REQUEST STATE + LOGGING
// ---------------------------------------------------------------------------

let REQ_START = Date.now();
let REQ_DEADLINE = REQ_START + GLOBAL_DEADLINE_MS;
let REQ_ID = "boot";
const STEPS = [];

function elapsedMs() {
  return Date.now() - REQ_START;
}

function remainingMs() {
  return REQ_DEADLINE - Date.now();
}

function log(message, data) {
  STEPS.push(`+${elapsedMs()}ms ${message}`);

  const line = `[verify-google-play][${REQ_ID}][+${elapsedMs()}ms][left:${remainingMs()}ms] ${message}`;

  if (data === undefined) {
    console.log(line);
    return;
  }

  let printable;

  try {
    printable = typeof data === "string" ? data : JSON.stringify(data);
  } catch (_) {
    printable = String(data);
  }

  console.log(`${line} :: ${printable}`);
}

function logError(message, error) {
  const text = error instanceof Error ? error.message : String(error);

  STEPS.push(`+${elapsedMs()}ms ERROR ${message}: ${text}`);

  console.error(
    `[verify-google-play][${REQ_ID}][+${elapsedMs()}ms] ERROR ${message} :: ${text}`
  );

  if (error instanceof Error && error.stack) {
    console.error(`[verify-google-play][${REQ_ID}] STACK :: ${error.stack}`);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


// ---------------------------------------------------------------------------
// BUDGETED FETCH
// ---------------------------------------------------------------------------

function budgetFor(desiredMs, reserveMs) {
  return Math.min(desiredMs, remainingMs() - (reserveMs || 0));
}

async function timedFetch(label, url, options, timeoutMs) {
  if (timeoutMs < MIN_CALL_MS) {
    throw new Error(
      `${label} skipped: only ${timeoutMs}ms of the request budget remained.`
    );
  }

  const controller = new AbortController();
  const startedAt = Date.now();

  const timer = setTimeout(() => {
    log(`${label} ABORT (budget ${timeoutMs}ms reached)`);
    controller.abort();
  }, timeoutMs);

  log(`${label} START`, {
    method: (options && options.method) || "GET",
    budgetMs: timeoutMs,
  });

  try {
    const response = await fetch(url, {
      ...(options || {}),
      signal: controller.signal,
    });

    const text = await response.text();

    log(`${label} DONE`, {
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      bytes: text ? text.length : 0,
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
      logError(`${label} TIMED OUT after ${Date.now() - startedAt}ms`, error);
      throw new Error(`${label} timed out after ${timeoutMs}ms.`);
    }

    logError(`${label} network failure`, error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function dbHeaders(extra) {
  return {
    apikey: DB_KEY,
    Authorization: `Bearer ${DB_KEY}`,
    "Content-Type": "application/json",
    ...(extra || {}),
  };
}


// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

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
  return /year|annual/i.test(productId) ? "yearly" : "monthly";
}

function pemToPkcs8Bytes(pem) {
  const body = String(pem)
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  if (!body) throw new Error("Google private_key is empty or malformed.");

  return decodeBase64(body);
}

function parseServiceAccount(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    try {
      return JSON.parse(new TextDecoder().decode(decodeBase64(raw)));
    } catch (_e) {
      throw new Error(
        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON (or base64 JSON)."
      );
    }
  }
}


// ---------------------------------------------------------------------------
// GOOGLE ACCESS TOKEN (cached between warm invocations)
// ---------------------------------------------------------------------------

let cachedToken = null;
let cachedKey = null;

async function getGoogleAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    log("STEP 1: reusing cached Google access token");
    return cachedToken.token;
  }

  log("STEP 1: building Google service-account JWT");

  const rawJson = getEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");

  if (!rawJson) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured.");
  }

  const creds = parseServiceAccount(rawJson);

  if (!creds.client_email || !creds.private_key) {
    throw new Error(
      "Google service account is missing client_email or private_key."
    );
  }

  log("STEP 1: service account loaded", {
    clientEmail: creds.client_email,
    projectId: creds.project_id || null,
  });

  const now = Math.floor(Date.now() / 1000);

  const signingInput =
    b64urlString(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
    "." +
    b64urlString(
      JSON.stringify({
        iss: creds.client_email,
        scope: "https://www.googleapis.com/auth/androidpublisher",
        aud: GOOGLE_OAUTH_URL,
        iat: now,
        exp: now + 3600,
      })
    );

  if (!cachedKey) {
    log("STEP 2: importing RSA private key");

    try {
      cachedKey = await crypto.subtle.importKey(
        "pkcs8",
        pemToPkcs8Bytes(creds.private_key),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
      );
    } catch (error) {
      logError("STEP 2: private key import failed", error);

      throw new Error(
        "Unable to import Google service account private key: " +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  log("STEP 2: signing JWT");

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cachedKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${b64url(new Uint8Array(signature))}`;

  log("STEP 3: requesting Google OAuth access token");

  const result = await timedFetch(
    "google-oauth",
    GOOGLE_OAUTH_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
    },
    budgetFor(MAX_GOOGLE_CALL_MS, DB_RESERVE_MS)
  );

  const data = result.body || {};

  if (!result.ok || !data.access_token) {
    logError(
      "STEP 3: Google OAuth failed",
      new Error(`HTTP ${result.status} ${data.error || ""}`)
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

  log("STEP 3: Google access token acquired");

  return cachedToken.token;
}

function playFetch(label, url, accessToken, options) {
  return timedFetch(
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
    budgetFor(MAX_GOOGLE_CALL_MS, DB_RESERVE_MS)
  );
}


// ---------------------------------------------------------------------------
// NORMALIZERS
// ---------------------------------------------------------------------------

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


// ---------------------------------------------------------------------------
// ACKNOWLEDGE (best effort)
// ---------------------------------------------------------------------------

async function acknowledgePurchase(
  accessToken,
  packageName,
  productId,
  purchaseToken
) {
  const url =
    `${GOOGLE_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}` +
    `/purchases/subscriptions/${encodeURIComponent(productId)}` +
    `/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;

  log("acknowledging purchase with Google", { productId });

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

  log("purchase acknowledged with Google");
}


// ---------------------------------------------------------------------------
// VERIFY
// ---------------------------------------------------------------------------

async function verifyGooglePlayPurchase(packageName, productId, purchaseToken) {
  const accessToken = await getGoogleAccessToken();

  const pkg = encodeURIComponent(packageName);
  const token = encodeURIComponent(purchaseToken);

  log("STEP 4: calling purchases.subscriptionsv2", { packageName, productId });

  const v2 = await playFetch(
    "google-subscriptionsv2",
    `${GOOGLE_PUBLISHER_BASE}/applications/${pkg}/purchases/subscriptionsv2/tokens/${token}`,
    accessToken
  );

  if (v2.ok) {
    const purchase = normalizeV2(v2.body, productId);

    log("STEP 4: v2 result", {
      active: purchase.active,
      state: purchase.state,
      productId: purchase.productId,
      expiryTimeMillis: purchase.expiryTimeMillis,
      acknowledged: purchase.acknowledged,
      autoRenewing: purchase.autoRenewing,
    });

    if (
      purchase.active &&
      !purchase.acknowledged &&
      remainingMs() > DB_RESERVE_MS + MIN_CALL_MS
    ) {
      try {
        await acknowledgePurchase(
          accessToken,
          packageName,
          purchase.productId || productId,
          purchaseToken
        );
        purchase.acknowledged = true;
      } catch (error) {
        logError("acknowledgement failed (continuing)", error);
      }
    }

    return purchase;
  }

  log("STEP 4: v2 failed", {
    status: v2.status,
    message: (v2.body && v2.body.error && v2.body.error.message) || null,
  });

  if (remainingMs() < DB_RESERVE_MS + MIN_CALL_MS) {
    throw new Error(
      `Google Play verification failed (v2 HTTP ${v2.status}); no budget left for the legacy fallback.`
    );
  }

  log("STEP 5: calling legacy purchases.subscriptions");

  const v1 = await playFetch(
    "google-subscriptions-v1",
    `${GOOGLE_PUBLISHER_BASE}/applications/${pkg}/purchases/subscriptions/${encodeURIComponent(
      productId
    )}/tokens/${token}`,
    accessToken
  );

  if (v1.ok) {
    const purchase = normalizeV1(v1.body, productId);

    log("STEP 5: v1 result", {
      active: purchase.active,
      state: purchase.state,
      expiryTimeMillis: purchase.expiryTimeMillis,
      acknowledged: purchase.acknowledged,
    });

    if (
      purchase.active &&
      !purchase.acknowledged &&
      remainingMs() > DB_RESERVE_MS + MIN_CALL_MS
    ) {
      try {
        await acknowledgePurchase(
          accessToken,
          packageName,
          purchase.productId || productId,
          purchaseToken
        );
        purchase.acknowledged = true;
      } catch (error) {
        logError("v1 acknowledgement failed (continuing)", error);
      }
    }

    return purchase;
  }

  throw new Error(
    (v1.body && v1.body.error && v1.body.error.message) ||
      (v2.body && v2.body.error && v2.body.error.message) ||
      `Google Play verification failed. v2=HTTP ${v2.status}, v1=HTTP ${v1.status}`
  );
}


// ---------------------------------------------------------------------------
// SAVE SUBSCRIPTION (single upsert; subscriptions.user_id is UNIQUE)
// ---------------------------------------------------------------------------

async function saveSubscription(userId, fields) {
  log("STEP 6: writing subscriptions row", {
    userId,
    status: fields.status,
    plan: fields.plan,
    product_id: fields.product_id,
    current_period_end: fields.current_period_end,
  });

  const upsert = await timedFetch(
    "db-upsert-subscription",
    `${REST_URL}/subscriptions?on_conflict=user_id`,
    {
      method: "POST",
      headers: dbHeaders({
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify({ user_id: userId, ...fields }),
    },
    Math.max(remainingMs() - 300, MIN_CALL_MS)
  );

  if (upsert.ok) {
    const rows = Array.isArray(upsert.body) ? upsert.body : [];

    log("STEP 6: subscription saved", {
      rows: rows.length,
      status: rows[0] ? rows[0].status : null,
      plan: rows[0] ? rows[0].plan : null,
    });

    return rows[0] || null;
  }

  log("STEP 6: upsert rejected, trying PATCH", {
    status: upsert.status,
    body: upsert.text ? upsert.text.slice(0, 300) : "",
  });

  const patch = await timedFetch(
    "db-patch-subscription",
    `${REST_URL}/subscriptions?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: dbHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify(fields),
    },
    MIN_CALL_MS * 2
  );

  if (!patch.ok) {
    throw new Error(
      `Subscription save failed. upsert=HTTP ${upsert.status} ${
        upsert.text ? upsert.text.slice(0, 200) : ""
      } | patch=HTTP ${patch.status} ${
        patch.text ? patch.text.slice(0, 200) : ""
      }`
    );
  }

  const rows = Array.isArray(patch.body) ? patch.body : [];

  log("STEP 6: subscription patched", { rows: rows.length });

  return rows[0] || null;
}


// ---------------------------------------------------------------------------
// DIAGNOSTICS
// ---------------------------------------------------------------------------

async function runDiagnostics() {
  log("DIAG: start");

  const result = {
    success: true,
    diag: true,
    hasDbKey: !!DB_KEY,
    hasServiceAccount: !!getEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"),
    packageName: GOOGLE_PACKAGE_NAME,
    google: { ok: false, ms: 0, error: null },
    database: { ok: false, ms: 0, status: 0, error: null },
  };

  let started = Date.now();

  try {
    await getGoogleAccessToken();
    result.google.ok = true;
  } catch (error) {
    result.google.error =
      error instanceof Error ? error.message : String(error);
  }

  result.google.ms = Date.now() - started;
  started = Date.now();

  try {
    const db = await timedFetch(
      "db-diag",
      `${REST_URL}/subscriptions?select=id&limit=1`,
      { headers: dbHeaders() },
      Math.max(remainingMs() - 300, MIN_CALL_MS)
    );

    result.database.ok = db.ok;
    result.database.status = db.status;

    if (!db.ok) result.database.error = db.text ? db.text.slice(0, 200) : "";
  } catch (error) {
    result.database.error =
      error instanceof Error ? error.message : String(error);
  }

  result.database.ms = Date.now() - started;
  result.totalMs = elapsedMs();
  result.steps = STEPS.slice();
  result.requestId = REQ_ID;

  log("DIAG: complete", result);

  return json(result);
}


// ---------------------------------------------------------------------------
// CORE
// ---------------------------------------------------------------------------

async function handleVerification(body) {
  if (body && String(body.action || "") === "diag") {
    return await runDiagnostics();
  }

  const platform = String((body && body.platform) || "google_play");

  if (!["google_play", "android", "google"].includes(platform)) {
    log("unsupported platform", platform);

    return json(
      {
        success: false,
        message: `Unsupported platform: ${platform}`,
        requestId: REQ_ID,
      },
      400
    );
  }

  const packageName =
    (body && (body.packageName || body.package_name)) || GOOGLE_PACKAGE_NAME;

  const productId = body && (body.productId || body.product_id);

  const purchaseToken =
    body && (body.purchaseToken || body.purchase_token || body.token);

  const userId = body && (body.userId || body.user_id);

  if (!packageName || !productId || !purchaseToken) {
    log("validation failed: missing purchase data", {
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
        requestId: REQ_ID,
      },
      400
    );
  }

  if (!isUuid(userId)) {
    log("validation failed: invalid userId", { userId: userId || null });

    return json(
      {
        success: false,
        message: "A valid userId UUID is required.",
        requestId: REQ_ID,
      },
      400
    );
  }

  log("validation ok", {
    packageName,
    productId,
    userId,
    purchaseTokenChars: String(purchaseToken).length,
  });

  const purchase = await verifyGooglePlayPurchase(
    packageName,
    productId,
    purchaseToken
  );

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

  // NOTE: this object previously used undefined purchaseDate / expiryDate.
  const subscription = await saveSubscription(userId, {

 status,
      plan,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),

  });

  log("SUCCESS", {
    active: purchase.active,
    status,
    plan,
    productId: purchase.productId || productId,
    current_period_end: currentPeriodEnd,
    savedRowId: subscription ? subscription.id : null,
    totalMs: elapsedMs(),
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
    totalMs: elapsedMs(),
    requestId: REQ_ID,
  });
}


// ---------------------------------------------------------------------------
// HANDLER
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  REQ_START = Date.now();
  REQ_DEADLINE = REQ_START + GLOBAL_DEADLINE_MS;
  STEPS.length = 0;

  try {
    REQ_ID = crypto.randomUUID().slice(0, 8);
  } catch (_) {
    REQ_ID = String(Date.now());
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }


  let deadlineTimer = null;

  try {
    if (!DB_KEY) {
      logError("database key missing", new Error("no service role / anon key"));

      return json(
        {
          success: false,
          message: "Database API key is not configured.",
          requestId: REQ_ID,
        },
        500
      );
    }

    let body;

    try {
      body = await req.json();
    } catch (_) {
      log("invalid JSON body");

      return json(
        {
          success: false,
          message: "Invalid JSON request body.",
          requestId: REQ_ID,
        },
        400
      );
    }

    log("body received", {
      action: body && body.action,
      platform: body && body.platform,
      productId: body && (body.productId || body.product_id),
      packageName: body && (body.packageName || body.package_name),
      userId: body && (body.userId || body.user_id),
      hasPurchaseToken: !!(
        body &&
        (body.purchaseToken || body.purchase_token || body.token)
      ),
    });

    const deadline = new Promise((_resolve, reject) => {
      deadlineTimer = setTimeout(() => {
        reject(
          new Error(
            `Verification exceeded the ${GLOBAL_DEADLINE_MS}ms budget - check the step log for the last completed step.`
          )
        );
      }, Math.max(remainingMs(), 500));
    });

    return await Promise.race([handleVerification(body), deadline]);
  } catch (error) {
    logError("REQUEST FAILED", error);

    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /timed out|budget|deadline/i.test(message);

    return json(
      {
        success: false,
        timeout: timedOut,
        message,
        steps: STEPS.slice(),
        totalMs: elapsedMs(),
        requestId: REQ_ID,
      },
      timedOut ? 504 : 500
    );
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    log("REQUEST END", { totalMs: elapsedMs() });
  }
});
