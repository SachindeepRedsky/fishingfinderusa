// =============================================================================
// verify-google-play
// =============================================================================
// Google Play subscription verification for Edge Runtime
//
// Flow:
//
// Android App
//    |
//    | purchaseToken
//    v
// Edge Function
//    |
//    | Pure-JS RS256 JWT
//    v
// Google OAuth
//    |
//    | access_token
//    v
// Google Play subscriptionsv2
//    |
//    | verified subscription
//    v
// Acknowledge purchase
//    |
//    v
// subscriptions table
//
// IMPORTANT:
// - Does NOT use node:crypto
// - Does NOT use Buffer
// - Does NOT use crypto.subtle.sign()
// - Uses jsrsasign for RS256
// - Uses subscriptionsv2 first
// - Uses legacy subscriptions API only as fallback
// =============================================================================


import {
  KJUR,
  KEYUTIL
} from "https://esm.sh/jsrsasign@11.1.0";


// =============================================================================
// ENV
// =============================================================================

function getEnv(key) {
  try {
    const value = Deno.env.get(key);

    return typeof value === "string"
      ? value.trim()
      : "";
  } catch (_) {
    return "";
  }
}


// =============================================================================
// CONFIG
// =============================================================================

const PROJECT_URL =
  getEnv("PROJECT_URL") ||
  "https://erbligiwkdfwxkhvwepw.databasepad.com";

const REST_URL =
  `${PROJECT_URL}/rest/v1`;

const DB_KEY =
  getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
  getEnv("SERVICE_ROLE_KEY") ||
  getEnv("SUPABASE_ANON_KEY") ||
  getEnv("ANON_KEY");

const DEFAULT_PACKAGE_NAME =
  getEnv("GOOGLE_PLAY_PACKAGE_NAME") ||
  "com.fishingfinderusa";


// =============================================================================
// CORS
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",

  "Access-Control-Allow-Methods":
    "POST, OPTIONS"
};


// =============================================================================
// JSON RESPONSE
// =============================================================================

function json(body, status = 200) {
  return new Response(
    JSON.stringify(body, null, 2),
    {
      status,

      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json"
      }
    }
  );
}


// =============================================================================
// UUID VALIDATION
// =============================================================================

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value)
  );
}


// =============================================================================
// PLAN DETECTION
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
// BASE64URL
// =============================================================================

function base64UrlEncode(input) {

  const bytes =
    new TextEncoder().encode(input);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


// =============================================================================
// HEX -> BASE64URL
// =============================================================================

function hexToBase64Url(hex) {

  let binary = "";

  for (
    let i = 0;
    i < hex.length;
    i += 2
  ) {
    binary += String.fromCharCode(
      parseInt(
        hex.substr(i, 2),
        16
      )
    );
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


// =============================================================================
// GOOGLE OAUTH
// =============================================================================

async function getGoogleAccessToken() {

  const raw =
    getEnv(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"
    );

  if (!raw) {
    throw new Error(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing."
    );
  }


  // ---------------------------------------------------------------------------
  // Parse service account
  // ---------------------------------------------------------------------------

  let credentials;

  try {

    credentials =
      JSON.parse(raw);

  } catch (_) {

    throw new Error(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is invalid JSON."
    );
  }


  const clientEmail =
    credentials.client_email;

  const privateKeyPem =
    credentials.private_key;


  if (!clientEmail) {

    throw new Error(
      "Google service account client_email is missing."
    );
  }


  if (!privateKeyPem) {

    throw new Error(
      "Google service account private_key is missing."
    );
  }


  // ---------------------------------------------------------------------------
  // JWT header
  // ---------------------------------------------------------------------------

  const header = {
    alg: "RS256",
    typ: "JWT"
  };


  // ---------------------------------------------------------------------------
  // JWT payload
  // ---------------------------------------------------------------------------

  const now =
    Math.floor(Date.now() / 1000);


  const payload = {

    iss:
      clientEmail,

    scope:
      "https://www.googleapis.com/auth/androidpublisher",

    aud:
      "https://oauth2.googleapis.com/token",

    iat:
      now,

    exp:
      now + 3600
  };


  const encodedHeader =
    base64UrlEncode(
      JSON.stringify(header)
    );


  const encodedPayload =
    base64UrlEncode(
      JSON.stringify(payload)
    );


  const signingInput =
    `${encodedHeader}.${encodedPayload}`;


  // ---------------------------------------------------------------------------
  // Import RSA private key using PURE JS
  // ---------------------------------------------------------------------------

  const privateKey =
    KEYUTIL.getKey(
      privateKeyPem
    );


  // ---------------------------------------------------------------------------
  // RS256 signature
  // ---------------------------------------------------------------------------

  const signature =
    new KJUR.crypto.Signature({
      alg: "SHA256withRSA"
    });


  signature.init(
    privateKey
  );


  signature.updateString(
    signingInput
  );


  const signatureHex =
    signature.sign();


  const encodedSignature =
    hexToBase64Url(
      signatureHex
    );


  // ---------------------------------------------------------------------------
  // Final JWT
  // ---------------------------------------------------------------------------

  const jwt =
    `${signingInput}.${encodedSignature}`;


  // ---------------------------------------------------------------------------
  // Google OAuth
  // ---------------------------------------------------------------------------

  const response =
    await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          `grant_type=${encodeURIComponent(
            "urn:ietf:params:oauth:grant-type:jwt-bearer"
          )}` +
          `&assertion=${encodeURIComponent(
            jwt
          )}`
      }
    );


  const data =
    await response.json()
      .catch(() => ({}));


  if (!response.ok) {

    throw new Error(
      data.error_description ||
      data.error ||
      `Google OAuth failed with HTTP ${response.status}.`
    );
  }


  if (!data.access_token) {

    throw new Error(
      "Google OAuth succeeded but no access_token was returned."
    );
  }


  return data.access_token;
}


// =============================================================================
// GOOGLE PLAY FETCH
// =============================================================================

async function playFetch(
  url,
  accessToken,
  options = {}
) {

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

          Accept:
            "application/json"
        },

        body:
          options.body
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
      raw: text
    };
  }


  return {
    ok:
      response.ok,

    status:
      response.status,

    body
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
    Array.isArray(raw?.lineItems)
      ? raw.lineItems
      : [];


  const line =
    lineItems.length > 0
      ? lineItems[0]
      : null;


  const expiryTimeMillis =
    line?.expiryTime
      ? Date.parse(
          line.expiryTime
        )
      : 0;


  const startTimeMillis =
    raw?.startTime
      ? Date.parse(
          raw.startTime
        )
      : 0;


  const state =
    String(
      raw?.subscriptionState || ""
    );


  // ---------------------------------------------------------------------------
  // Entitlement states
  //
  // ACTIVE
  // GRACE_PERIOD
  //
  // CANCELED can still be entitled until expiry.
  // ---------------------------------------------------------------------------

  const entitlementStates = [
    "SUBSCRIPTION_STATE_ACTIVE",

    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",

    "SUBSCRIPTION_STATE_CANCELED"
  ];


  const active =
    entitlementStates.includes(state) &&
    expiryTimeMillis > Date.now();


  const autoRenewing =
    !!(
      line &&
      line.autoRenewingPlan &&
      line.autoRenewingPlan.autoRenewEnabled
    );


  const productId =
    line?.productId ||
    fallbackProductId ||
    null;


  const acknowledged =
    String(
      raw?.acknowledgementState || ""
    ) ===
    "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";


  return {

    apiVersion:
      "v2",

    active,

    state,

    expiryTimeMillis,

    startTimeMillis,

    autoRenewing,

    productId,

    acknowledged,

    raw
  };
}


// =============================================================================
// NORMALIZE V1
// =============================================================================

function normalizeV1(
  raw,
  fallbackProductId
) {

  const expiryTimeMillis =
    Number(
      raw?.expiryTimeMillis || 0
    );


  const startTimeMillis =
    Number(
      raw?.startTimeMillis || 0
    );


  const paymentState =
    raw?.paymentState === undefined
      ? 1
      : Number(
          raw.paymentState
        );


  const active =
    expiryTimeMillis >
      Date.now() &&
    [1, 2, 3].includes(
      paymentState
    );


  const acknowledged =
    Number(
      raw?.acknowledgementState === undefined
        ? 1
        : raw.acknowledgementState
    ) === 1;


  return {

    apiVersion:
      "v1",

    active,

    state:
      `paymentState:${paymentState}`,

    expiryTimeMillis,

    startTimeMillis,

    autoRenewing:
      !!raw?.autoRenewing,

    productId:
      fallbackProductId || null,

    acknowledged,

    raw
  };
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
  // V2 FIRST
  // ===========================================================================

  const v2Url =
    `https://androidpublisher.googleapis.com/` +
    `androidpublisher/v3/applications/` +
    `${pkg}/purchases/subscriptionsv2/tokens/${token}`;


  const v2 =
    await playFetch(
      v2Url,
      accessToken
    );


  if (v2.ok) {

    return normalizeV2(
      v2.body,
      productId
    );
  }


  // ===========================================================================
  // V1 FALLBACK
  // ===========================================================================

  if (!productId) {

    throw new Error(
      `Google Play subscriptionsv2 failed with HTTP ${v2.status} ` +
      `and productId is required for legacy fallback.`
    );
  }


  const v1Url =
    `https://androidpublisher.googleapis.com/` +
    `androidpublisher/v3/applications/` +
    `${pkg}/purchases/subscriptions/` +
    `${encodeURIComponent(productId)}/tokens/${token}`;


  const v1 =
    await playFetch(
      v1Url,
      accessToken
    );


  if (v1.ok) {

    return normalizeV1(
      v1.body,
      productId
    );
  }


  const v2Message =
    v2.body?.error?.message ||
    null;


  const v1Message =
    v1.body?.error?.message ||
    null;


  throw new Error(
    `Google Play verification failed. ` +
    `V2 HTTP ${v2.status}: ${v2Message || "unknown"}. ` +
    `V1 HTTP ${v1.status}: ${v1Message || "unknown"}.`
  );
}


// =============================================================================
// ACKNOWLEDGE SUBSCRIPTION
// =============================================================================
//
// Google currently exposes subscription acknowledgement through:
// purchases.subscriptions.acknowledge
//
// This is intentionally NON-FATAL.
// Verification remains successful even if acknowledgement fails.
// =============================================================================

async function acknowledgeSubscription(
  accessToken,
  packageName,
  productId,
  purchaseToken
) {

  if (!productId) {

    return {
      attempted: false,
      success: false,
      message:
        "Cannot acknowledge because productId is missing."
    };
  }


  const url =
    `https://androidpublisher.googleapis.com/` +
    `androidpublisher/v3/applications/` +
    `${encodeURIComponent(packageName)}` +
    `/purchases/subscriptions/` +
    `${encodeURIComponent(productId)}` +
    `/tokens/` +
    `${encodeURIComponent(purchaseToken)}` +
    `:acknowledge`;


  const response =
    await playFetch(
      url,
      accessToken,
      {
        method: "POST",

        body:
          JSON.stringify({})
      }
    );


  if (
    response.ok ||
    response.status === 200 ||
    response.status === 204
  ) {

    return {
      attempted: true,
      success: true,
      httpStatus:
        response.status
    };
  }


  return {
    attempted: true,
    success: false,
    httpStatus:
      response.status,
    error:
      response.body?.error || null
  };
}


// =============================================================================
// DATABASE HEADERS
// =============================================================================

function dbHeaders() {

  if (!DB_KEY) {

    throw new Error(
      "Database service key is not configured."
    );
  }


  return {

    apikey:
      DB_KEY,

    Authorization:
      `Bearer ${DB_KEY}`,

    "Content-Type":
      "application/json"
  };
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


  // ---------------------------------------------------------------------------
  // Check existing row
  // ---------------------------------------------------------------------------

  const selectUrl =
    `${REST_URL}/subscriptions` +
    `?user_id=eq.${encodedUser}` +
    `&select=id` +
    `&limit=1`;


  const selectResponse =
    await fetch(
      selectUrl,
      {
        method: "GET",

        headers:
          dbHeaders()
      }
    );


  const selectText =
    await selectResponse.text();


  if (!selectResponse.ok) {

    throw new Error(
      `Subscription lookup failed ` +
      `(HTTP ${selectResponse.status}): ` +
      selectText
    );
  }


  let existing = [];


  try {

    existing =
      JSON.parse(
        selectText
      );

  } catch (_) {

    existing = [];
  }


  // ---------------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------------

  if (
    Array.isArray(existing) &&
    existing.length > 0
  ) {

    const updateResponse =
      await fetch(
        `${REST_URL}/subscriptions` +
        `?user_id=eq.${encodedUser}`,
        {
          method: "PATCH",

          headers: {
            ...dbHeaders(),

            Prefer:
              "return=representation"
          },

          body:
            JSON.stringify(
              fields
            )
        }
      );


    const updateText =
      await updateResponse.text();


    if (!updateResponse.ok) {

      throw new Error(
        `Subscription update failed ` +
        `(HTTP ${updateResponse.status}): ` +
        updateText
      );
    }


    try {

      const rows =
        JSON.parse(
          updateText
        );

      return Array.isArray(rows)
        ? rows[0] || null
        : rows;

    } catch (_) {

      return null;
    }
  }


  // ---------------------------------------------------------------------------
  // INSERT
  // ---------------------------------------------------------------------------

  const insertResponse =
    await fetch(
      `${REST_URL}/subscriptions`,
      {
        method: "POST",

        headers: {
          ...dbHeaders(),

          Prefer:
            "return=representation"
        },

        body:
          JSON.stringify({
            user_id:
              userId,

            ...fields
          })
      }
    );


  const insertText =
    await insertResponse.text();


  if (!insertResponse.ok) {

    throw new Error(
      `Subscription insert failed ` +
      `(HTTP ${insertResponse.status}): ` +
      insertText
    );
  }


  try {

    const rows =
      JSON.parse(
        insertText
      );

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

  // ===========================================================================
  // OPTIONS
  // ===========================================================================

  if (
    req.method === "OPTIONS"
  ) {

    return new Response(
      "ok",
      {
        status: 200,
        headers:
          corsHeaders
      }
    );
  }


  // ===========================================================================
  // ONLY POST
  // ===========================================================================

  if (
    req.method !== "POST"
  ) {

    return json(
      {
        success: false,

        message:
          "Only POST requests are allowed."
      },
      405
    );
  }


  const started =
    Date.now();


  try {

    // =========================================================================
    // DATABASE KEY
    // =========================================================================

    if (!DB_KEY) {

      return json(
        {
          success: false,

          step:
            "configuration",

          message:
            "Database API key is missing."
        },
        500
      );
    }


    // =========================================================================
    // REQUEST BODY
    // =========================================================================

    let body;


    try {

      body =
        await req.json();

    } catch (_) {

      return json(
        {
          success: false,

          step:
            "request",

          message:
            "Invalid JSON request body."
        },
        400
      );
    }


    // =========================================================================
    // PLATFORM
    // =========================================================================

    const platform =
      body?.platform
        ? String(
            body.platform
          ).toLowerCase()
        : "google_play";


    if (
      ![
        "google_play",
        "android",
        "google"
      ].includes(platform)
    ) {

      return json(
        {
          success: false,

          step:
            "request",

          message:
            `Unsupported platform: ${platform}`
        },
        400
      );
    }


    // =========================================================================
    // PACKAGE
    // =========================================================================

    const packageName =
      body?.packageName ||
      body?.package_name ||
      DEFAULT_PACKAGE_NAME;


    // =========================================================================
    // PRODUCT
    // =========================================================================

    const requestedProductId =
      body?.productId ||
      body?.product_id ||
      null;


    // =========================================================================
    // PURCHASE TOKEN
    // =========================================================================

    const purchaseToken =
      body?.purchaseToken ||
      body?.purchase_token ||
      body?.token ||
      null;


    // =========================================================================
    // USER ID
    // =========================================================================

    const userId =
      body?.userId ||
      body?.user_id ||
      null;


    // =========================================================================
    // VALIDATION
    // =========================================================================

    if (
      !packageName
    ) {

      return json(
        {
          success: false,

          step:
            "validation",

          message:
            "packageName is required."
        },
        400
      );
    }


    if (
      !purchaseToken
    ) {

      return json(
        {
          success: false,

          step:
            "validation",

          message:
            "purchaseToken is required."
        },
        400
      );
    }


    if (
      !isUuid(userId)
    ) {

      return json(
        {
          success: false,

          step:
            "validation",

          message:
            "A valid userId UUID is required."
        },
        400
      );
    }


    // =========================================================================
    // GOOGLE PLAY VERIFICATION
    // =========================================================================

    const purchase =
      await verifyGooglePlayPurchase(
        packageName,
        requestedProductId,
        purchaseToken
      );


    // =========================================================================
    // PRODUCT ID
    // =========================================================================

    const productId =
      purchase.productId ||
      requestedProductId ||
      null;


    // =========================================================================
    // STATUS
    // =========================================================================

    const status =
      purchase.active
        ? "active"
        : "expired";


    // =========================================================================
    // PLAN
    // =========================================================================

    const plan =
      purchase.active
        ? planFromProductId(
            productId
          )
        : "free";


    // =========================================================================
    // PERIOD START
    // =========================================================================

    const currentPeriodStart =
      purchase.startTimeMillis > 0
        ? new Date(
            purchase.startTimeMillis
          ).toISOString()
        : new Date()
            .toISOString();


    // =========================================================================
    // PERIOD END
    // =========================================================================

    const currentPeriodEnd =
      purchase.expiryTimeMillis > 0
        ? new Date(
            purchase.expiryTimeMillis
          ).toISOString()
        : null;


    // =========================================================================
    // ACKNOWLEDGEMENT
    // =========================================================================

    let acknowledgement = {
      attempted: false,
      success:
        purchase.acknowledged
    };


    // Only acknowledge active/unacknowledged purchases.
    //
    // For an expired/unacknowledged purchase we don't want to blindly
    // acknowledge it.
    //

    if (
      purchase.active &&
      !purchase.acknowledged
    ) {

      const accessToken =
        await getGoogleAccessToken();


      acknowledgement =
        await acknowledgeSubscription(
          accessToken,
          packageName,
          productId,
          purchaseToken
        );
    }


    // =========================================================================
    // DATABASE SAVE
    // =========================================================================

    const row =
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
            new Date()
              .toISOString()
        }
      );


    // =========================================================================
    // FINAL RESPONSE
    // =========================================================================

    return json(
      {

        success: true,

        active:
          purchase.active,

        status,

        plan,

        provider:
          "google_play",

        platform:
          "android",

        packageName,

        productId,

        apiVersion:
          purchase.apiVersion,

        subscriptionState:
          purchase.state,

        acknowledged:
          purchase.acknowledged,

        acknowledgement,

        autoRenewing:
          purchase.autoRenewing,

        expiryTimeMillis:
          purchase.expiryTimeMillis,

        current_period_start:
          currentPeriodStart,

        current_period_end:
          currentPeriodEnd,

        subscription:
          row,

        elapsedMs:
          Date.now() - started,

        message:
          purchase.active
            ? "Google Play purchase verified and subscription activated."
            : "Google Play purchase verified but subscription is not active."
      }
    );


  } catch (error) {

    console.error(
      "verify-google-play error:",
      error
    );


    return json(
      {

        success: false,

        step:
          "verify-google-play",

        message:
          error instanceof Error
            ? error.message
            : String(error),

        elapsedMs:
          Date.now() - started
      },
      500
    );
  }
});