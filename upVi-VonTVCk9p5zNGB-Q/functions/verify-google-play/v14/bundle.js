// =============================================================================
// verify-google-play
// =============================================================================
// Google Play subscription verification for Deno Edge Function.
//
// Flow:
//
//   1. Receive purchaseToken from Android
//   2. Create Google service-account JWT
//   3. Exchange JWT for Google OAuth access token
//   4. Verify with purchases.subscriptionsv2
//   5. Fallback to purchases.subscriptions if V2 fails
//   6. Acknowledge purchase without blocking the main verification
//   7. Save subscription using select -> update/insert
//
// IMPORTANT:
// - No Node Buffer
// - No require()
// - No @supabase/supabase-js
// - No upsert/on_conflict
// - Every network request has a timeout
// - Purchase token is NEVER written to logs
// - Logs use [FAMOUS-AI] prefix
// =============================================================================


// =============================================================================
// ENVIRONMENT
// =============================================================================

function getEnv(key) {
  try {
    const g = globalThis;

    if (g.Deno?.env?.get) {
      const value = g.Deno.env.get(key);

      if (typeof value === "string") {
        return value.trim();
      }
    }

    if (typeof g.process?.env?.[key] === "string") {
      return g.process.env[key].trim();
    }
  } catch (_) {
    // Ignore environment access errors.
  }

  return "";
}


// =============================================================================
// CONFIG
// =============================================================================

const PROJECT_URL =
  "https://erbligiwkdfwxkhvwepw.databasepad.com";

const REST_URL =
  `${PROJECT_URL}/rest/v1`;

const DB_KEY =
  getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
  getEnv("SERVICE_ROLE_KEY") ||
  getEnv("SUPABASE_ANON_KEY") ||
  getEnv("ANON_KEY");

const GOOGLE_PACKAGE_NAME =
  getEnv("GOOGLE_PLAY_PACKAGE_NAME") ||
  "com.fishingfinderusa";

const GOOGLE_ANDROID_PUBLISHER_BASE =
  "https://androidpublisher.googleapis.com/androidpublisher/v3";

const GOOGLE_OAUTH_TOKEN_URL =
  "https://oauth2.googleapis.com/token";

// 10 seconds per external request.
// This prevents the edge function from sitting until the gateway returns 504.
const REQUEST_TIMEOUT_MS = 10000;


// =============================================================================
// FAMOUS-AI LOGGING
// =============================================================================

function log(...args) {
  console.log("[FAMOUS-AI]", ...args);
}

function warn(...args) {
  console.warn("[FAMOUS-AI]", ...args);
}

function errorLog(...args) {
  console.error("[FAMOUS-AI]", ...args);
}


// =============================================================================
// RESPONSE
// =============================================================================

function json(body, status = 200) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods":
          "POST, OPTIONS",
        "Content-Type": "application/json",
      },
    }
  );
}


// =============================================================================
// FETCH WITH TIMEOUT
// =============================================================================

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  const started = Date.now();

  try {
    log(
      "HTTP START",
      options.method || "GET",
      sanitizeUrl(url)
    );

    const response = await fetch(
      url,
      {
        ...options,
        signal: controller.signal,
      }
    );

    log(
      "HTTP END",
      options.method || "GET",
      sanitizeUrl(url),
      "status=" + response.status,
      "durationMs=" + (Date.now() - started)
    );

    return response;
  } catch (err) {
    const duration =
      Date.now() - started;

    if (err?.name === "AbortError") {
      errorLog(
        "HTTP TIMEOUT",
        options.method || "GET",
        sanitizeUrl(url),
        "timeoutMs=" + timeoutMs,
        "durationMs=" + duration
      );

      throw new Error(
        `Request timed out after ${timeoutMs}ms: ${sanitizeUrl(url)}`
      );
    }

    errorLog(
      "HTTP ERROR",
      options.method || "GET",
      sanitizeUrl(url),
      "durationMs=" + duration,
      err
    );

    throw err;
  } finally {
    clearTimeout(timer);
  }
}


// Do not expose the purchase token in logs.
function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);

    if (parsed.pathname.includes("/tokens/")) {
      const parts =
        parsed.pathname.split("/");

      const tokenIndex =
        parts.indexOf("tokens");

      if (tokenIndex >= 0 &&
          tokenIndex + 1 < parts.length) {
        parts[tokenIndex + 1] =
          "[PURCHASE_TOKEN]";
      }

      parsed.pathname =
        parts.join("/");
    }

    return parsed.toString();
  } catch (_) {
    return "[URL]";
  }
}


// =============================================================================
// DATABASE
// =============================================================================

function dbHeaders() {
  return {
    apikey: DB_KEY,
    Authorization: `Bearer ${DB_KEY}`,
    "Content-Type": "application/json",
  };
}


// =============================================================================
// UUID
// =============================================================================

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim()
    )
  );
}


// =============================================================================
// PLAN
// =============================================================================

function planFromProductId(productId) {
  if (!productId) {
    return "monthly";
  }

  if (/year|annual/i.test(productId)) {
    return "yearly";
  }

  if (/month/i.test(productId)) {
    return "monthly";
  }

  return "monthly";
}


// =============================================================================
// BASE64 / JWT
// =============================================================================

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    binary += String.fromCharCode(
      ...Array.from(
        bytes.subarray(
          i,
          i + chunkSize
        )
      )
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
  return base64UrlFromBytes(
    new TextEncoder().encode(value)
  );
}


function base64ToBytes(value) {
  const binary = atob(value);

  const bytes =
    new Uint8Array(binary.length);

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}


function pemToPkcs8Bytes(pem) {
  const normalized =
    String(pem)
      .replace(/\\n/g, "\n")
      .trim();

  const body =
    normalized
      .replace(
        /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
        ""
      )
      .replace(
        /-----END [A-Z ]*PRIVATE KEY-----/g,
        ""
      )
      .replace(/\s+/g, "");

  if (!body) {
    throw new Error(
      "Google private key is empty or malformed."
    );
  }

  return base64ToBytes(body);
}


// =============================================================================
// GOOGLE ACCESS TOKEN
// =============================================================================

let cachedToken = null;


async function getGoogleAccessToken() {

  log("GOOGLE AUTH: starting");

  if (
    cachedToken &&
    cachedToken.expiresAt >
      Date.now() + 60000
  ) {

    log(
      "GOOGLE AUTH: using cached access token"
    );

    return cachedToken.token;
  }


  const serviceAccountJson =
    getEnv(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"
    );

  if (!serviceAccountJson) {
    throw new Error(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured."
    );
  }


  let credentials;

  try {
    credentials =
      JSON.parse(
        serviceAccountJson
      );
  } catch (_) {
    throw new Error(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON contains invalid JSON."
    );
  }


  const clientEmail =
    credentials.client_email;

  const privateKey =
    credentials.private_key;


  if (!clientEmail || !privateKey) {
    throw new Error(
      "Google service account is missing client_email or private_key."
    );
  }


  log(
    "GOOGLE AUTH: credentials loaded",
    "clientEmail=" + clientEmail
  );


  const now =
    Math.floor(
      Date.now() / 1000
    );


  const header =
    base64UrlFromString(
      JSON.stringify({
        alg: "RS256",
        typ: "JWT",
      })
    );


  const payload =
    base64UrlFromString(
      JSON.stringify({
        iss: clientEmail,

        scope:
          "https://www.googleapis.com/auth/androidpublisher",

        aud:
          GOOGLE_OAUTH_TOKEN_URL,

        iat:
          now,

        exp:
          now + 3600,
      })
    );


  const signingInput =
    `${header}.${payload}`;


  log(
    "GOOGLE AUTH: importing private key"
  );


  const key =
    await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8Bytes(
        privateKey
      ),
      {
        name:
          "RSASSA-PKCS1-v1_5",

        hash:
          "SHA-256",
      },
      false,
      ["sign"]
    );


  log(
    "GOOGLE AUTH: signing JWT"
  );


  const signature =
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(
        signingInput
      )
    );


  const jwt =
    `${signingInput}.${base64UrlFromBytes(
      new Uint8Array(signature)
    )}`;


  log(
    "GOOGLE AUTH: requesting OAuth access token"
  );


  const response =
    await fetchWithTimeout(
      GOOGLE_OAUTH_TOKEN_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          new URLSearchParams({
            grant_type:
              "urn:ietf:params:oauth:grant-type:jwt-bearer",

            assertion:
              jwt,
          }),
      }
    );


  const text =
    await response.text();


  let data = {};


  try {
    data =
      text
        ? JSON.parse(text)
        : {};
  } catch (_) {
    data = {
      raw: text,
    };
  }


  if (
    !response.ok ||
    !data.access_token
  ) {

    errorLog(
      "GOOGLE AUTH FAILED",
      "status=" + response.status,
      data
    );

    throw new Error(
      data.error_description ||
      data.error ||
      `Google OAuth failed with HTTP ${response.status}.`
    );
  }


  cachedToken = {
    token:
      data.access_token,

    expiresAt:
      Date.now() +
      Number(
        data.expires_in || 3600
      ) * 1000,
  };


  log(
    "GOOGLE AUTH: access token received"
  );


  return cachedToken.token;
}


// =============================================================================
// GOOGLE API REQUEST
// =============================================================================

async function playFetch(
  url,
  accessToken,
  options = {}
) {

  const response =
    await fetchWithTimeout(
      url,
      {
        method:
          options.method || "GET",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json",
        },

        body:
          options.body,
      }
    );


  const text =
    await response.text();


  let body = {};


  try {
    body =
      text
        ? JSON.parse(text)
        : {};
  } catch (_) {

    body = {
      raw: text,
    };
  }


  return {
    ok:
      response.ok,

    status:
      response.status,

    body,
  };
}


// =============================================================================
// NORMALIZE V2
// =============================================================================

function normalizeV2(
  raw,
  fallbackProductId
) {

  const lineItems =
    Array.isArray(
      raw?.lineItems
    )
      ? raw.lineItems
      : [];


  // Use the line item with the latest expiry.
  let line = null;

  for (
    const item of lineItems
  ) {

    if (!line) {
      line = item;
      continue;
    }

    const currentExpiry =
      item?.expiryTime
        ? Date.parse(
            item.expiryTime
          )
        : 0;

    const existingExpiry =
      line?.expiryTime
        ? Date.parse(
            line.expiryTime
          )
        : 0;

    if (
      currentExpiry >
      existingExpiry
    ) {
      line = item;
    }
  }


  const expiry =
    line?.expiryTime
      ? Date.parse(
          line.expiryTime
        )
      : 0;


  const start =
    raw?.startTime
      ? Date.parse(
          raw.startTime
        )
      : 0;


  const state =
    String(
      raw?.subscriptionState || ""
    );


  const activeStates = [
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_CANCELED",
  ];


  const acknowledgementState =
    String(
      raw?.acknowledgementState || ""
    );


  return {

    apiVersion:
      "v2",

    active:
      activeStates.includes(
        state
      ) &&
      expiry > Date.now(),

    state,

    expiryTimeMillis:
      expiry || 0,

    startTimeMillis:
      start || 0,

    autoRenewing:
      !!(
        line?.autoRenewingPlan
          ?.autoRenewEnabled
      ),

    productId:
      line?.productId ||
      fallbackProductId ||
      null,

    acknowledged:
      acknowledgementState ===
      "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",

    acknowledgementState,

    raw,
  };
}


// =============================================================================
// NORMALIZE V1
// =============================================================================

function normalizeV1(
  raw,
  productId
) {

  const expiry =
    Number(
      raw?.expiryTimeMillis || 0
    );


  const start =
    Number(
      raw?.startTimeMillis || 0
    );


  const paymentState =
    raw?.paymentState === undefined
      ? 1
      : Number(
          raw.paymentState
        );


  return {

    apiVersion:
      "v1",

    active:
      expiry > Date.now() &&
      [1, 2, 3].includes(
        paymentState
      ),

    state:
      `paymentState:${paymentState}`,

    expiryTimeMillis:
      expiry,

    startTimeMillis:
      start,

    autoRenewing:
      !!raw?.autoRenewing,

    productId:
      productId || null,

    acknowledged:
      Number(
        raw?.acknowledgementState ??
          1
      ) === 1,

    raw,
  };
}


// =============================================================================
// ACKNOWLEDGE
// =============================================================================
//
// Google currently exposes acknowledgement through the legacy
// purchases.subscriptions endpoint even when the purchase was read using
// subscriptionsv2.
// =============================================================================

async function acknowledgePurchase(
  accessToken,
  packageName,
  productId,
  purchaseToken
) {

  if (!productId) {
    warn(
      "ACK: productId missing, skipping"
    );

    return;
  }


  const url =
    `${GOOGLE_ANDROID_PUBLISHER_BASE}` +
    `/applications/${encodeURIComponent(packageName)}` +
    `/purchases/subscriptions/` +
    `${encodeURIComponent(productId)}` +
    `/tokens/` +
    `${encodeURIComponent(purchaseToken)}` +
    `:acknowledge`;


  log(
    "ACK: starting",
    "productId=" + productId
  );


  try {

    const result =
      await playFetch(
        url,
        accessToken,
        {
          method: "POST",

          body:
            JSON.stringify({}),
        }
      );


    if (
      result.ok
    ) {

      log(
        "ACK: SUCCESS",
        "productId=" + productId
      );

      return true;
    }


    warn(
      "ACK: Google returned error",
      "status=" + result.status,
      result.body?.error?.message ||
        "unknown error"
    );


    return false;

  } catch (err) {

    // VERY IMPORTANT:
    // acknowledgement failure should NOT prevent the subscription
    // from being saved as active.
    errorLog(
      "ACK: failed/non-fatal",
      err
    );

    return false;
  }
}


// =============================================================================
// VERIFY GOOGLE PURCHASE
// =============================================================================

async function verifyGooglePlayPurchase(
  packageName,
  productId,
  purchaseToken
) {

  log(
    "VERIFY: starting",
    "packageName=" + packageName,
    "productId=" + productId,
    "tokenPresent=" + !!purchaseToken
  );


  const accessToken =
    await getGoogleAccessToken();


  const pkg =
    encodeURIComponent(
      packageName
    );


  const token =
    encodeURIComponent(
      purchaseToken
    );


  // ===========================================================================
  // V2
  // ===========================================================================

  const v2Url =
    `${GOOGLE_ANDROID_PUBLISHER_BASE}` +
    `/applications/${pkg}` +
    `/purchases/subscriptionsv2/tokens/${token}`;


  log(
    "VERIFY V2: calling Google"
  );


  let v2;


  try {

    v2 =
      await playFetch(
        v2Url,
        accessToken
      );

  } catch (err) {

    errorLog(
      "VERIFY V2: request failed",
      err
    );

    throw new Error(
      `Google subscriptionsv2 request failed: ${err.message}`
    );
  }


  log(
    "VERIFY V2: status=" +
      v2.status
  );


  if (v2.ok) {

    const purchase =
      normalizeV2(
        v2.body,
        productId
      );


    log(
      "VERIFY V2: SUCCESS",
      JSON.stringify({
        active:
          purchase.active,

        productId:
          purchase.productId,

        state:
          purchase.state,

        expiry:
          purchase.expiryTimeMillis,

        autoRenewing:
          purchase.autoRenewing,

        acknowledgementState:
          purchase.acknowledgementState,
      })
    );


    // -------------------------------------------------------------------------
    // ACKNOWLEDGE
    // -------------------------------------------------------------------------
    //
    // Do NOT wait for acknowledgement before saving the user's subscription.
    //
    // The subscription has already been verified by Google.
    //
    // We start acknowledgement separately and let it finish in the background.
    // -------------------------------------------------------------------------

    if (
      purchase.active &&
      !purchase.acknowledged
    ) {

      log(
        "VERIFY V2: purchase requires acknowledgement"
      );


      // Fire and forget.
      acknowledgePurchase(
        accessToken,
        packageName,
        purchase.productId ||
          productId,
        purchaseToken
      ).catch((err) => {
        errorLog(
          "BACKGROUND ACK ERROR",
          err
        );
      });

    } else {

      log(
        "VERIFY V2: acknowledgement not required",
        "acknowledged=" +
          purchase.acknowledged
      );
    }


    return purchase;
  }


  // ===========================================================================
  // V1 FALLBACK
  // ===========================================================================

  log(
    "VERIFY V2 failed, trying V1 fallback",
    "status=" + v2.status,
    "message=" +
      (
        v2.body?.error?.message ||
        "unknown"
      )
  );


  const v1Url =
    `${GOOGLE_ANDROID_PUBLISHER_BASE}` +
    `/applications/${pkg}` +
    `/purchases/subscriptions/` +
    `${encodeURIComponent(productId)}` +
    `/tokens/${token}`;


  let v1;


  try {

    v1 =
      await playFetch(
        v1Url,
        accessToken
      );

  } catch (err) {

    errorLog(
      "VERIFY V1: request failed",
      err
    );

    throw new Error(
      `Google subscriptions request failed: ${err.message}`
    );
  }


  log(
    "VERIFY V1: status=" +
      v1.status
  );


  if (v1.ok) {

    const purchase =
      normalizeV1(
        v1.body,
        productId
      );


    log(
      "VERIFY V1: SUCCESS",
      JSON.stringify({
        active:
          purchase.active,

        productId:
          purchase.productId,

        state:
          purchase.state,

        expiry:
          purchase.expiryTimeMillis,

        autoRenewing:
          purchase.autoRenewing,

        acknowledged:
          purchase.acknowledged,
      })
    );


    if (
      purchase.active &&
      !purchase.acknowledged
    ) {

      log(
        "VERIFY V1: purchase requires acknowledgement"
      );


      acknowledgePurchase(
        accessToken,
        packageName,
        purchase.productId ||
          productId,
        purchaseToken
      ).catch((err) => {
        errorLog(
          "BACKGROUND ACK ERROR",
          err
        );
      });

    }


    return purchase;
  }


  const message =
    v2.body?.error?.message ||
    v1.body?.error?.message ||
    `Google verification failed. V2=${v2.status}, V1=${v1.status}`;


  errorLog(
    "VERIFY GOOGLE FAILED",
    message
  );


  throw new Error(
    message
  );
}


// =============================================================================
// SAVE SUBSCRIPTION
// =============================================================================

async function saveSubscription(
  userId,
  fields
) {

  const encodedUser =
    encodeURIComponent(
      userId
    );


  // ===========================================================================
  // LOOKUP
  // ===========================================================================

  const lookupUrl =
    `${REST_URL}/subscriptions` +
    `?user_id=eq.${encodedUser}` +
    `&select=id` +
    `&limit=1`;


  log(
    "DB: checking subscription",
    "userId=" + userId
  );


  let lookup;


  try {

    lookup =
      await fetchWithTimeout(
        lookupUrl,
        {
          method: "GET",

          headers:
            dbHeaders(),
        }
      );

  } catch (err) {

    errorLog(
      "DB LOOKUP FAILED",
      err
    );

    throw new Error(
      `Database lookup failed: ${err.message}`
    );
  }


  const lookupText =
    await lookup.text();


  if (!lookup.ok) {

    errorLog(
      "DB LOOKUP HTTP ERROR",
      lookup.status,
      lookupText
    );

    throw new Error(
      `Subscription lookup failed: HTTP ${lookup.status}`
    );
  }


  let existing = [];


  try {

    existing =
      JSON.parse(
        lookupText
      );

  } catch (_) {

    existing = [];
  }


  // ===========================================================================
  // UPDATE
  // ===========================================================================

  if (
    Array.isArray(existing) &&
    existing.length > 0
  ) {

    log(
      "DB: existing subscription found",
      "action=UPDATE"
    );


    const updateUrl =
      `${REST_URL}/subscriptions` +
      `?user_id=eq.${encodedUser}`;


    let response;


    try {

      response =
        await fetchWithTimeout(
          updateUrl,
          {
            method: "PATCH",

            headers: {
              ...dbHeaders(),

              Prefer:
                "return=representation",
            },

            body:
              JSON.stringify(
                fields
              ),
          }
        );

    } catch (err) {

      errorLog(
        "DB UPDATE FAILED",
        err
      );

      throw new Error(
        `Database update failed: ${err.message}`
      );
    }


    const text =
      await response.text();


    if (!response.ok) {

      errorLog(
        "DB UPDATE HTTP ERROR",
        response.status,
        text
      );

      throw new Error(
        `Subscription update failed: HTTP ${response.status}`
      );
    }


    log(
      "DB: subscription updated successfully"
    );


    try {

      const rows =
        JSON.parse(text);

      return Array.isArray(rows)
        ? rows[0]
        : rows;

    } catch (_) {

      return null;
    }
  }


  // ===========================================================================
  // INSERT
  // ===========================================================================

  log(
    "DB: no subscription found",
    "action=INSERT"
  );


  let response;


  try {

    response =
      await fetchWithTimeout(
        `${REST_URL}/subscriptions`,
        {
          method: "POST",

          headers: {
            ...dbHeaders(),

            Prefer:
              "return=representation",
          },

          body:
            JSON.stringify({
              user_id:
                userId,

              ...fields,
            }),
        }
      );

  } catch (err) {

    errorLog(
      "DB INSERT FAILED",
      err
    );

    throw new Error(
      `Database insert failed: ${err.message}`
    );
  }


  const text =
    await response.text();


  if (!response.ok) {

    errorLog(
      "DB INSERT HTTP ERROR",
      response.status,
      text
    );

    throw new Error(
      `Subscription insert failed: HTTP ${response.status}`
    );
  }


  log(
    "DB: subscription inserted successfully"
  );


  try {

    const rows =
      JSON.parse(text);

    return Array.isArray(rows)
      ? rows[0]
      : rows;

  } catch (_) {

    return null;
  }
}


// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {

  const requestStarted =
    Date.now();


  // ===========================================================================
  // CORS
  // ===========================================================================

  if (
    req.method === "OPTIONS"
  ) {

    return new Response(
      "ok",
      {
        headers: corsHeaders,
      }
    );
  }


  try {

    log(
      "================================================"
    );

    log(
      "VERIFY GOOGLE PLAY REQUEST START"
    );

    log(
      "method=" + req.method
    );


    // =========================================================================
    // DATABASE KEY
    // =========================================================================

    if (!DB_KEY) {

      errorLog(
        "DB KEY MISSING"
      );

      return json(
        {
          success:
            false,

          error:
            "Database API key is missing.",
        },
        500
      );
    }


    // =========================================================================
    // READ BODY
    // =========================================================================

    let body;


    try {

      body =
        await req.json();

    } catch (_) {

      errorLog(
        "REQUEST JSON INVALID"
      );

      return json(
        {
          success:
            false,

          error:
            "Request body is not valid JSON.",
        },
        400
      );
    }


    // =========================================================================
    // SAFE LOGGING
    // =========================================================================

    log(
      "REQUEST BODY:",
      JSON.stringify({
        action:
          body?.action || null,

        platform:
          body?.platform || null,

        productId:
          body?.productId ||
          body?.product_id ||
          null,

        packageName:
          body?.packageName ||
          body?.package_name ||
          GOOGLE_PACKAGE_NAME,

        userId:
          body?.userId ||
          body?.user_id ||
          null,

        purchaseToken:
          body?.purchaseToken ||
          body?.purchase_token ||
          body?.token
            ? "[RECEIVED]"
            : "[MISSING]",
      })
    );


    // =========================================================================
    // PLATFORM
    // =========================================================================

    const platform =
      String(
        body?.platform ||
          "google_play"
      );


    if (
      ![
        "google_play",
        "android",
        "google",
      ].includes(platform)
    ) {

      return json(
        {
          success:
            false,

          error:
            `Unsupported platform: ${platform}`,
        },
        400
      );
    }


    // =========================================================================
    // PURCHASE DATA
    // =========================================================================

    const packageName =
      body?.packageName ||
      body?.package_name ||
      GOOGLE_PACKAGE_NAME;


    const productId =
      body?.productId ||
      body?.product_id;


    const purchaseToken =
      body?.purchaseToken ||
      body?.purchase_token ||
      body?.token;


    const userId =
      body?.userId ||
      body?.user_id;


    // =========================================================================
    // VALIDATE
    // =========================================================================

    if (
      !packageName ||
      !productId ||
      !purchaseToken
    ) {

      errorLog(
        "PURCHASE DATA INVALID"
      );

      return json(
        {
          success:
            false,

          error:
            "packageName, productId and purchaseToken are required.",

          received: {
            packageName:
              !!packageName,

            productId:
              !!productId,

            purchaseToken:
              !!purchaseToken,
          },
        },
        400
      );
    }


    if (
      !isUuid(userId)
    ) {

      errorLog(
        "USER ID INVALID",
        userId
      );

      return json(
        {
          success:
            false,

          error:
            "Invalid userId.",

          message:
            "A valid user UUID is required.",
        },
        400
      );
    }


    log(
      "VALIDATION PASSED",
      "packageName=" + packageName,
      "productId=" + productId,
      "userId=" + userId
    );


    // =========================================================================
    // VERIFY GOOGLE
    // =========================================================================

    const purchase =
      await verifyGooglePlayPurchase(
        packageName,
        productId,
        purchaseToken
      );


    // =========================================================================
    // SUBSCRIPTION DATA
    // =========================================================================

    const status =
      purchase.active
        ? "active"
        : "expired";


    const plan =
      purchase.active
        ? planFromProductId(
            purchase.productId ||
              productId
          )
        : "free";


    const currentPeriodEnd =
      purchase.expiryTimeMillis > 0
        ? new Date(
            purchase.expiryTimeMillis
          ).toISOString()
        : null;


    const currentPeriodStart =
      purchase.startTimeMillis > 0
        ? new Date(
            purchase.startTimeMillis
          ).toISOString()
        : new Date().toISOString();


    log(
      "SUBSCRIPTION RESULT",
      JSON.stringify({
        active:
          purchase.active,

        status,

        plan,

        productId:
          purchase.productId ||
          productId,

        apiVersion:
          purchase.apiVersion,

        state:
          purchase.state,

        expiry:
          currentPeriodEnd,

        autoRenewing:
          purchase.autoRenewing,

        acknowledged:
          purchase.acknowledged,
      })
    );


    // =========================================================================
    // SAVE DATABASE
    // =========================================================================

    const subscription =
      await saveSubscription(
        userId,
        {
          status,

          plan,

          provider:
            "google_play",

          platform:
            "android",

          product_id:
            purchase.productId ||
            productId,

          purchase_token:
            purchaseToken,

          auto_renewing:
            purchase.autoRenewing,

          current_period_start:
            currentPeriodStart,

          current_period_end:
            currentPeriodEnd,

          raw_receipt:
            purchase.raw ||
            null,

          updated_at:
            new Date().toISOString(),
        }
      );


    // =========================================================================
    // SUCCESS
    // =========================================================================

    const duration =
      Date.now() -
      requestStarted;


    log(
      "================================================"
    );

    log(
      "VERIFY GOOGLE PLAY SUCCESS",
      "durationMs=" + duration
    );

    log(
      "================================================"
    );


    return json(
      {
        success:
          true,

        active:
          purchase.active,

        userId,

        status,

        plan,

        productId:
          purchase.productId ||
          productId,

        apiVersion:
          purchase.apiVersion,

        subscriptionState:
          purchase.state,

        autoRenewing:
          purchase.autoRenewing,

        acknowledged:
          purchase.acknowledged,

        expiryTimeMillis:
          purchase.expiryTimeMillis,

        current_period_end:
          currentPeriodEnd,

        provider:
          "google_play",

        subscription,

        message:
          purchase.active
            ? "Google Play purchase verified and subscription activated."
            : "Purchase verified but subscription is not active.",

        durationMs:
          duration,
      }
    );


  } catch (err) {

    const duration =
      Date.now() -
      requestStarted;


    errorLog(
      "================================================"
    );

    errorLog(
      "VERIFY GOOGLE PLAY FAILED",
      "durationMs=" + duration
    );

    errorLog(
      err
    );

    errorLog(
      "================================================"
    );


    return json(
      {
        success:
          false,

        error:
          err instanceof Error
            ? err.message
            : String(err),

        durationMs:
          duration,
      },
      500
    );
  }
});