// =============================================================================
// verify-google-play
// =============================================================================
// Google Play subscription verification Edge Function
//
// Flow:
//   1. Receive purchaseToken from app
//   2. Create Google service-account JWT
//   3. Exchange JWT for Google OAuth access token
//   4. Verify subscription using subscriptionsv2
//   5. Fallback to legacy subscriptions endpoint
//   6. Acknowledge active purchase when required
//   7. Save subscription into database
//   8. Return verified subscription status
// =============================================================================


// =============================================================================
// ENVIRONMENT
// =============================================================================

function getEnv(key) {
  try {
    const g = globalThis;

    if (g.Deno && g.Deno.env && g.Deno.env.get) {
      const value = g.Deno.env.get(key);

      if (typeof value === "string") {
        return value.trim();
      }
    }

    if (
      g.process &&
      g.process.env &&
      typeof g.process.env[key] === "string"
    ) {
      return g.process.env[key].trim();
    }
  } catch (_) {
    // Ignore environment errors.
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

const GOOGLE_PUBLISHER_BASE =
  "https://androidpublisher.googleapis.com/androidpublisher/v3";

const GOOGLE_OAUTH_URL =
  "https://oauth2.googleapis.com/token";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",

  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};


// =============================================================================
// LOGGING
// =============================================================================

function famousLog(message, data) {
  const timestamp =
    new Date().toISOString();

  if (data !== undefined) {
    console.log(
      `[FAMOUS_AI ${timestamp}] ${message}`,
      data
    );
  } else {
    console.log(
      `[FAMOUS_AI ${timestamp}] ${message}`
    );
  }
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
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}


// =============================================================================
// DATABASE
// =============================================================================

function dbHeaders() {
  return {
    apikey: DB_KEY,

    Authorization:
      `Bearer ${DB_KEY}`,

    "Content-Type":
      "application/json",
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
// BASE64 HELPERS
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
    new Uint8Array(
      binary.length
    );

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
      "Google private_key is empty or malformed."
    );
  }

  return base64ToBytes(body);
}


// =============================================================================
// GOOGLE ACCESS TOKEN
// =============================================================================

let cachedToken = null;


async function getGoogleAccessToken() {

  famousLog(
    "STEP 1: Getting Google OAuth access token"
  );

  if (
    cachedToken &&
    cachedToken.expiresAt >
      Date.now() + 60000
  ) {

    famousLog(
      "Using cached Google access token"
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


  if (
    !clientEmail ||
    !privateKey
  ) {
    throw new Error(
      "Google service account is missing client_email or private_key."
    );
  }


  famousLog(
    "Google service account loaded",
    {
      clientEmail,
      hasPrivateKey: !!privateKey,
    }
  );


  const now =
    Math.floor(
      Date.now() / 1000
    );


  // ---------------------------------------------------------------------------
  // JWT HEADER
  // ---------------------------------------------------------------------------

  const header =
    base64UrlFromString(
      JSON.stringify({
        alg: "RS256",
        typ: "JWT",
      })
    );


  // ---------------------------------------------------------------------------
  // JWT PAYLOAD
  // ---------------------------------------------------------------------------

  const payload =
    base64UrlFromString(
      JSON.stringify({
        iss: clientEmail,

        scope:
          "https://www.googleapis.com/auth/androidpublisher",

        aud:
          GOOGLE_OAUTH_URL,

        iat:
          now,

        exp:
          now + 3600,
      })
    );


  const signingInput =
    `${header}.${payload}`;


  famousLog(
    "Creating RS256 JWT signature"
  );


  // ---------------------------------------------------------------------------
  // IMPORT PRIVATE KEY
  // ---------------------------------------------------------------------------

  let cryptoKey;

  try {

    cryptoKey =
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

  } catch (error) {

    famousLog(
      "Google private key import FAILED",
      error instanceof Error
        ? error.message
        : String(error)
    );

    throw new Error(
      "Unable to import Google service account private key: " +
      (
        error instanceof Error
          ? error.message
          : String(error)
      )
    );
  }


  // ---------------------------------------------------------------------------
  // SIGN JWT
  // ---------------------------------------------------------------------------

  const signatureBuffer =
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",

      cryptoKey,

      new TextEncoder().encode(
        signingInput
      )
    );


  const signature =
    base64UrlFromBytes(
      new Uint8Array(
        signatureBuffer
      )
    );


  const jwt =
    `${signingInput}.${signature}`;


  famousLog(
    "JWT created successfully"
  );


  // ---------------------------------------------------------------------------
  // GOOGLE OAUTH REQUEST
  // ---------------------------------------------------------------------------

  famousLog(
    "STEP 2: Requesting Google OAuth token"
  );


  const response =
    await fetch(
      GOOGLE_OAUTH_URL,
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


  famousLog(
    "Google OAuth response",
    {
      status:
        response.status,

      ok:
        response.ok,

      hasAccessToken:
        !!data.access_token,

      error:
        data.error ||
        null,
    }
  );


  if (
    !response.ok ||
    !data.access_token
  ) {

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
      ) *
        1000,
  };


  famousLog(
    "Google OAuth token received successfully"
  );


  return cachedToken.token;
}


// =============================================================================
// GOOGLE API FETCH
// =============================================================================

async function playFetch(
  url,
  accessToken,
  options = {}
) {

  famousLog(
    "Google API request START",
    {
      method:
        options.method || "GET",

      url:
        url.replace(
          /\/tokens\/[^/:]+/g,
          "/tokens/[REDACTED]"
        ),
    }
  );


  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      15000
    );


  try {

    const response =
      await fetch(
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

          signal:
            controller.signal,
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


    famousLog(
      "Google API response",
      {
        status:
          response.status,

        ok:
          response.ok,

        error:
          body &&
          body.error
            ? body.error.message ||
              body.error.status ||
              null
            : null,
      }
    );


    return {
      ok:
        response.ok,

      status:
        response.status,

      body,
    };

  } catch (error) {

    if (
      error &&
      error.name === "AbortError"
    ) {

      famousLog(
        "Google API request TIMED OUT after 15 seconds"
      );

      throw new Error(
        "Google Play API request timed out after 15 seconds."
      );
    }


    throw error;

  } finally {

    clearTimeout(timeout);
  }
}


// =============================================================================
// NORMALIZE V2
// =============================================================================

function normalizeV2(
  raw,
  fallbackProductId
) {

  const line =
    Array.isArray(
      raw &&
      raw.lineItems
    ) &&
    raw.lineItems.length > 0
      ? raw.lineItems[0]
      : null;


  const expiry =
    line &&
    line.expiryTime
      ? Date.parse(
          line.expiryTime
        )
      : 0;


  const start =
    raw &&
    raw.startTime
      ? Date.parse(
          raw.startTime
        )
      : 0;


  const state =
    String(
      raw &&
      raw.subscriptionState
        ? raw.subscriptionState
        : ""
    );


  const activeStates = [
    "SUBSCRIPTION_STATE_ACTIVE",

    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",

    "SUBSCRIPTION_STATE_CANCELED",
  ];


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
        line &&
        line.autoRenewingPlan &&
        line.autoRenewingPlan
          .autoRenewEnabled
      ),

    productId:
      (
        line &&
        line.productId
      ) ||
      fallbackProductId ||
      null,

    acknowledged:
      String(
        raw &&
        raw.acknowledgementState
          ? raw.acknowledgementState
          : ""
      ) ===
      "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",

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
      raw &&
      raw.expiryTimeMillis
        ? raw.expiryTimeMillis
        : 0
    );


  const start =
    Number(
      raw &&
      raw.startTimeMillis
        ? raw.startTimeMillis
        : 0
    );


  const paymentState =
    raw &&
    raw.paymentState !== undefined
      ? Number(
          raw.paymentState
        )
      : 1;


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
      !!(
        raw &&
        raw.autoRenewing
      ),

    productId:
      productId ||
      null,

    acknowledged:
      Number(
        raw &&
        raw.acknowledgementState !==
          undefined
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


  famousLog(
    "Acknowledging Google Play purchase",
    {
      packageName,
      productId,
    }
  );


  const result =
    await playFetch(
      url,
      accessToken,
      {
        method:
          "POST",

        body:
          JSON.stringify({}),
      }
    );


  if (!result.ok) {

    const message =
      result.body &&
      result.body.error &&
      result.body.error.message
        ? result.body.error.message
        : `Google acknowledgement failed with HTTP ${result.status}.`;


    throw new Error(
      message
    );
  }


  famousLog(
    "Google purchase acknowledged successfully"
  );


  return true;
}


// =============================================================================
// VERIFY GOOGLE PLAY PURCHASE
// =============================================================================

async function verifyGooglePlayPurchase(
  packageName,
  productId,
  purchaseToken
) {

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
    `${GOOGLE_PUBLISHER_BASE}` +
    `/applications/${pkg}` +
    `/purchases/subscriptionsv2/tokens/${token}`;


  famousLog(
    "STEP 4: Calling Google subscriptions V2"
  );


  const v2 =
    await playFetch(
      v2Url,
      accessToken
    );


  famousLog(
    "Google V2 status",
    v2.status
  );


  if (v2.ok) {

    const purchase =
      normalizeV2(
        v2.body,
        productId
      );


    famousLog(
      "V2 purchase normalized",
      {
        active:
          purchase.active,

        state:
          purchase.state,

        productId:
          purchase.productId,

        expiry:
          purchase.expiryTimeMillis,

        acknowledged:
          purchase.acknowledged,

        autoRenewing:
          purchase.autoRenewing,
      }
    );


    // -------------------------------------------------------------------------
    // ACKNOWLEDGE
    // -------------------------------------------------------------------------

    if (
      purchase.active &&
      !purchase.acknowledged
    ) {

      famousLog(
        "Purchase is active but not acknowledged"
      );


      try {

        await acknowledgePurchase(
          accessToken,
          packageName,
          purchase.productId ||
            productId,
          purchaseToken
        );

        purchase.acknowledged =
          true;

      } catch (error) {

        // Do not fail the subscription verification
        // just because acknowledgement failed.

        famousLog(
          "Acknowledgement failed - continuing",
          error instanceof Error
            ? error.message
            : String(error)
        );
      }
    }


    return purchase;
  }


  // ===========================================================================
  // V1 FALLBACK
  // ===========================================================================

  famousLog(
    "V2 verification failed; trying V1 fallback",
    {
      status:
        v2.status,

      message:
        v2.body &&
        v2.body.error
          ? v2.body.error.message
          : null,
    }
  );


  const v1Url =
    `${GOOGLE_PUBLISHER_BASE}` +
    `/applications/${pkg}` +
    `/purchases/subscriptions/` +
    `${encodeURIComponent(productId)}` +
    `/tokens/${token}`;


  famousLog(
    "STEP 5: Calling Google subscriptions V1"
  );


  const v1 =
    await playFetch(
      v1Url,
      accessToken
    );


  famousLog(
    "Google V1 status",
    v1.status
  );


  if (v1.ok) {

    const purchase =
      normalizeV1(
        v1.body,
        productId
      );


    famousLog(
      "V1 purchase normalized",
      {
        active:
          purchase.active,

        state:
          purchase.state,

        productId:
          purchase.productId,

        expiry:
          purchase.expiryTimeMillis,

        acknowledged:
          purchase.acknowledged,

        autoRenewing:
          purchase.autoRenewing,
      }
    );


    if (
      purchase.active &&
      !purchase.acknowledged
    ) {

      famousLog(
        "V1 purchase is active but not acknowledged"
      );


      try {

        await acknowledgePurchase(
          accessToken,
          packageName,
          purchase.productId ||
            productId,
          purchaseToken
        );

        purchase.acknowledged =
          true;

      } catch (error) {

        famousLog(
          "V1 acknowledgement failed - continuing",
          error instanceof Error
            ? error.message
            : String(error)
        );
      }
    }


    return purchase;
  }


  const v2Message =
    v2.body &&
    v2.body.error &&
    v2.body.error.message
      ? v2.body.error.message
      : null;


  const v1Message =
    v1.body &&
    v1.body.error &&
    v1.body.error.message
      ? v1.body.error.message
      : null;


  throw new Error(
    v1Message ||
    v2Message ||
    `Google Play verification failed. V2=${v2.status}, V1=${v1.status}`
  );
}


// =============================================================================
// SAVE SUBSCRIPTION
// =============================================================================

async function saveSubscription(
  userId,
  fields
) {

  famousLog(
    "STEP 6: Saving subscription to database",
    {
      userId,
    }
  );


  const encodedUser =
    encodeURIComponent(
      userId
    );


  // ===========================================================================
  // SELECT
  // ===========================================================================

  const lookupUrl =
    `${REST_URL}/subscriptions` +
    `?user_id=eq.${encodedUser}` +
    `&select=id` +
    `&limit=1`;


  famousLog(
    "Checking existing subscription"
  );


  const lookupController =
    new AbortController();


  const lookupTimeout =
    setTimeout(
      () => {
        lookupController.abort();
      },
      10000
    );


  let lookup;

  try {

    lookup =
      await fetch(
        lookupUrl,
        {
          headers:
            dbHeaders(),

          signal:
            lookupController.signal,
        }
      );

  } catch (error) {

    if (
      error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "Database lookup timed out after 10 seconds."
      );
    }

    throw error;

  } finally {

    clearTimeout(
      lookupTimeout
    );
  }


  const lookupText =
    await lookup.text();


  famousLog(
    "Database lookup response",
    {
      status:
        lookup.status,

      ok:
        lookup.ok,
    }
  );


  if (!lookup.ok) {

    throw new Error(
      `Subscription lookup failed: HTTP ${lookup.status} ${lookupText}`
    );
  }


  let existing = [];


  try {

    existing =
      lookupText
        ? JSON.parse(
            lookupText
          )
        : [];

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

    famousLog(
      "Existing subscription found - updating"
    );


    const response =
      await fetch(
        `${REST_URL}/subscriptions?user_id=eq.${encodedUser}`,
        {
          method:
            "PATCH",

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


    const text =
      await response.text();


    if (!response.ok) {

      throw new Error(
        `Subscription update failed: HTTP ${response.status} ${text}`
      );
    }


    famousLog(
      "Subscription UPDATE successful"
    );


    try {

      const rows =
        text
          ? JSON.parse(text)
          : [];


      return Array.isArray(rows)
        ? rows[0] || null
        : rows;

    } catch (_) {

      return null;
    }
  }


  // ===========================================================================
  // INSERT
  // ===========================================================================

  famousLog(
    "No existing subscription found - creating new row"
  );


  const response =
    await fetch(
      `${REST_URL}/subscriptions`,
      {
        method:
          "POST",

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


  const text =
    await response.text();


  if (!response.ok) {

    throw new Error(
      `Subscription insert failed: HTTP ${response.status} ${text}`
    );
  }


  famousLog(
    "Subscription INSERT successful"
  );


  try {

    const rows =
      text
        ? JSON.parse(text)
        : [];


    return Array.isArray(rows)
      ? rows[0] || null
      : rows;

  } catch (_) {

    return null;
  }
}


// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {

  const requestId =
    crypto.randomUUID();


  famousLog(
    "=========================================="
  );

  famousLog(
    "VERIFY GOOGLE PLAY REQUEST START",
    {
      requestId,
      method:
        req.method,
    }
  );


  // ===========================================================================
  // CORS
  // ===========================================================================

  if (
    req.method === "OPTIONS"
  ) {

    famousLog(
      "CORS OPTIONS request"
    );

    return new Response(
      "ok",
      {
        headers:
          corsHeaders,
      }
    );
  }


  try {

    // =========================================================================
    // DATABASE KEY
    // =========================================================================

    famousLog(
      "Checking database configuration"
    );


    if (!DB_KEY) {

      famousLog(
        "DATABASE KEY MISSING"
      );


      return json(
        {
          success:
            false,

          message:
            "Database API key is not configured.",
        },
        500
      );
    }


    famousLog(
      "Database configuration OK"
    );


    // =========================================================================
    // READ BODY
    // =========================================================================

    let body;


    try {

      body =
        await req.json();

    } catch (_) {

      famousLog(
        "Request body is invalid JSON"
      );


      return json(
        {
          success:
            false,

          message:
            "Invalid JSON request body.",
        },
        400
      );
    }


    famousLog(
      "Request body received",
      {
        action:
          body &&
          body.action,

        platform:
          body &&
          body.platform,

        productId:
          body &&
          (
            body.productId ||
            body.product_id
          ),

        packageName:
          body &&
          (
            body.packageName ||
            body.package_name
          ),

        userId:
          body &&
          (
            body.userId ||
            body.user_id
          ),

        purchaseTokenReceived:
          !!(
            body &&
            (
              body.purchaseToken ||
              body.purchase_token ||
              body.token
            )
          ),
      }
    );


    // =========================================================================
    // PLATFORM
    // =========================================================================

    const platform =
      String(
        (
          body &&
          body.platform
        ) ||
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

          message:
            `Unsupported platform: ${platform}`,
        },
        400
      );
    }


    // =========================================================================
    // PURCHASE DATA
    // =========================================================================

    const packageName =
      (
        body &&
        (
          body.packageName ||
          body.package_name
        )
      ) ||
      GOOGLE_PACKAGE_NAME;


    const productId =
      body &&
      (
        body.productId ||
        body.product_id
      );


    const purchaseToken =
      body &&
      (
        body.purchaseToken ||
        body.purchase_token ||
        body.token
      );


    // =========================================================================
    // USER
    // =========================================================================

    const userId =
      body &&
      (
        body.userId ||
        body.user_id
      );


    // =========================================================================
    // VALIDATION
    // =========================================================================

    if (
      !packageName ||
      !productId ||
      !purchaseToken
    ) {

      famousLog(
        "Missing Google purchase data"
      );


      return json(
        {
          success:
            false,

          message:
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

      famousLog(
        "Invalid user UUID",
        {
          userId,
        }
      );


      return json(
        {
          success:
            false,

          message:
            "A valid userId UUID is required.",
        },
        400
      );
    }


    famousLog(
      "Input validation successful",
      {
        packageName,
        productId,
        userId,
        purchaseTokenReceived:
          true,
      }
    );


    // =========================================================================
    // GOOGLE VERIFICATION
    // =========================================================================

    const purchase =
      await verifyGooglePlayPurchase(
        packageName,
        productId,
        purchaseToken
      );


    famousLog(
      "STEP 7: Google verification completed",
      {
        active:
          purchase.active,

        apiVersion:
          purchase.apiVersion,

        state:
          purchase.state,

        productId:
          purchase.productId,

        expiry:
          purchase.expiryTimeMillis,

        autoRenewing:
          purchase.autoRenewing,

        acknowledged:
          purchase.acknowledged,
      }
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


    // =========================================================================
    // SAVE
    // =========================================================================

    const subscription =
      await saveSubscription(
        userId,
        {
          status,
      plan,
      current_period_start: purchaseDate,
      current_period_end: expiryDate,
      updated_at: new Date().toISOString(),
        }
      );


    // =========================================================================
    // SUCCESS
    // =========================================================================

    famousLog(
      "=========================================="
    );

    famousLog(
      "GOOGLE PLAY VERIFICATION SUCCESS",
      {
        requestId,

        active:
          purchase.active,

        status,

        plan,

        productId:
          purchase.productId ||
          productId,

        expiry:
          currentPeriodEnd,
      }
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
            : "Google Play purchase verified but subscription is not active.",

        requestId,
      }
    );

  } catch (error) {

    famousLog(
      "=========================================="
    );

    famousLog(
      "VERIFY GOOGLE PLAY ERROR",
      {
        requestId,

        error:
          error instanceof Error
            ? error.message
            : String(error),

        stack:
          error instanceof Error
            ? error.stack
            : null,
      }
    );


    return json(
      {
        success:
          false,

        message:
          error instanceof Error
            ? error.message
            : String(error),

        requestId,
      },
      500
    );
  }
});