// =============================================================================
// verify-google-play
// =============================================================================
// Verifies a Google Play subscription purchase token with the Android Publisher
// API and saves the verified subscription into the subscriptions table.
//
// Uses:
//   1. Google service-account JWT -> OAuth access token
//   2. purchases.subscriptionsv2:get for modern subscriptions
//   3. purchases.subscriptions:get as legacy fallback
//   4. purchases.subscriptions:acknowledge for acknowledgement
//   5. Direct REST API for database access
//   6. Select -> update-or-insert (no upsert/on_conflict)
// =============================================================================


// -----------------------------------------------------------------------------
// ENVIRONMENT
// -----------------------------------------------------------------------------

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


// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------

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


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};


// -----------------------------------------------------------------------------
// RESPONSE
// -----------------------------------------------------------------------------

function json(body, status = 200) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}


// -----------------------------------------------------------------------------
// DATABASE
// -----------------------------------------------------------------------------

function dbHeaders() {
  return {
    apikey: DB_KEY,
    Authorization: `Bearer ${DB_KEY}`,
    "Content-Type": "application/json",
  };
}


// -----------------------------------------------------------------------------
// UUID
// -----------------------------------------------------------------------------

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim()
    )
  );
}


// -----------------------------------------------------------------------------
// PLAN
// -----------------------------------------------------------------------------

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


// -----------------------------------------------------------------------------
// BASE64 / JWT HELPERS
// -----------------------------------------------------------------------------

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
        bytes.subarray(i, i + chunkSize)
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


// -----------------------------------------------------------------------------
// GOOGLE ACCESS TOKEN
// -----------------------------------------------------------------------------

let cachedToken = null;


async function getGoogleAccessToken() {

  if (
    cachedToken &&
    cachedToken.expiresAt >
      Date.now() + 60000
  ) {
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
      JSON.parse(serviceAccountJson);
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

  const now =
    Math.floor(Date.now() / 1000);

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
        iat: now,
        exp: now + 3600,
      })
    );

  const signingInput =
    `${header}.${payload}`;

  const key =
    await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8Bytes(privateKey),
      {
        name:
          "RSASSA-PKCS1-v1_5",
        hash:
          "SHA-256",
      },
      false,
      ["sign"]
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

  const response =
    await fetch(
      GOOGLE_OAUTH_TOKEN_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body: new URLSearchParams({
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
      text ? JSON.parse(text) : {};
  } catch (_) {
    data = {
      raw: text,
    };
  }

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

  return cachedToken.token;
}


// -----------------------------------------------------------------------------
// GOOGLE API REQUEST
// -----------------------------------------------------------------------------

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


// -----------------------------------------------------------------------------
// NORMALIZE V2
// -----------------------------------------------------------------------------

function normalizeV2(
  raw,
  fallbackProductId
) {

  const line =
    Array.isArray(raw?.lineItems) &&
    raw.lineItems.length > 0
      ? raw.lineItems[0]
      : null;

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

  return {
    apiVersion:
      "v2",

    active:
      activeStates.includes(state) &&
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
      String(
        raw?.acknowledgementState || ""
      ) ===
      "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",

    raw,
  };
}


// -----------------------------------------------------------------------------
// NORMALIZE V1
// -----------------------------------------------------------------------------

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


// -----------------------------------------------------------------------------
// ACKNOWLEDGE PURCHASE
// -----------------------------------------------------------------------------

async function acknowledgePurchase(
  accessToken,
  packageName,
  productId,
  purchaseToken
) {

  const url =
    `${GOOGLE_ANDROID_PUBLISHER_BASE}` +
    `/applications/${encodeURIComponent(packageName)}` +
    `/purchases/subscriptions/${encodeURIComponent(productId)}` +
    `/tokens/${encodeURIComponent(purchaseToken)}` +
    `:acknowledge`;

  console.log(
    "Acknowledging Google Play purchase..."
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

  console.log(
    "Google acknowledgement status:",
    result.status
  );

  if (!result.ok) {
    const message =
      result.body?.error?.message ||
      `Google acknowledgement failed with HTTP ${result.status}.`;

    throw new Error(message);
  }

  return true;
}


// -----------------------------------------------------------------------------
// VERIFY PURCHASE
// -----------------------------------------------------------------------------

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


  // ---------------------------------------------------------------------------
  // V2
  // ---------------------------------------------------------------------------

  const v2Url =
    `${GOOGLE_ANDROID_PUBLISHER_BASE}` +
    `/applications/${pkg}` +
    `/purchases/subscriptionsv2/tokens/${token}`;

  console.log(
    "Calling Google subscriptions V2..."
  );

  const v2 =
    await playFetch(
      v2Url,
      accessToken
    );

  console.log(
    "Google Play V2 status:",
    v2.status
  );

  if (v2.ok) {

    const purchase =
      normalizeV2(
        v2.body,
        productId
      );

    console.log(
      "V2 purchase state:",
      purchase.state
    );

    console.log(
      "V2 purchase active:",
      purchase.active
    );

    console.log(
      "V2 product:",
      purchase.productId
    );

    console.log(
      "V2 expiry:",
      purchase.expiryTimeMillis
    );


    // Acknowledge active unacknowledged purchase.
    if (
      purchase.active &&
      !purchase.acknowledged
    ) {

      await acknowledgePurchase(
        accessToken,
        packageName,
        purchase.productId ||
          productId,
        purchaseToken
      );

      purchase.acknowledged = true;
    }

    return purchase;
  }


  // ---------------------------------------------------------------------------
  // V1 FALLBACK
  // ---------------------------------------------------------------------------

  const v1Url =
    `${GOOGLE_ANDROID_PUBLISHER_BASE}` +
    `/applications/${pkg}` +
    `/purchases/subscriptions/` +
    `${encodeURIComponent(productId)}` +
    `/tokens/${token}`;

  console.log(
    "Calling Google subscriptions V1 fallback..."
  );

  const v1 =
    await playFetch(
      v1Url,
      accessToken
    );

  console.log(
    "Google Play V1 status:",
    v1.status
  );

  if (v1.ok) {

    const purchase =
      normalizeV1(
        v1.body,
        productId
      );

    console.log(
      "V1 purchase active:",
      purchase.active
    );

    console.log(
      "V1 expiry:",
      purchase.expiryTimeMillis
    );


    if (
      purchase.active &&
      !purchase.acknowledged
    ) {

      await acknowledgePurchase(
        accessToken,
        packageName,
        purchase.productId ||
          productId,
        purchaseToken
      );

      purchase.acknowledged = true;
    }

    return purchase;
  }


  const message =
    v2.body?.error?.message ||
    v1.body?.error?.message ||
    `Google verification failed. V2=${v2.status}, V1=${v1.status}`;

  throw new Error(message);
}


// -----------------------------------------------------------------------------
// SAVE SUBSCRIPTION
// -----------------------------------------------------------------------------

async function saveSubscription(
  userId,
  fields
) {

  const encodedUser =
    encodeURIComponent(
      userId
    );


  // ---------------------------------------------------------------------------
  // CHECK EXISTING
  // ---------------------------------------------------------------------------

  const lookupUrl =
    `${REST_URL}/subscriptions` +
    `?user_id=eq.${encodedUser}` +
    `&select=id` +
    `&limit=1`;

  console.log(
    "Checking existing subscription..."
  );

  const lookup =
    await fetch(
      lookupUrl,
      {
        headers:
          dbHeaders(),
      }
    );

  const lookupText =
    await lookup.text();

  if (!lookup.ok) {
    throw new Error(
      `Subscription lookup failed: HTTP ${lookup.status} ${lookupText}`
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


  // ---------------------------------------------------------------------------
  // UPDATE EXISTING
  // ---------------------------------------------------------------------------

  if (
    Array.isArray(existing) &&
    existing.length > 0
  ) {

    console.log(
      "Updating existing subscription for:",
      userId
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


  // ---------------------------------------------------------------------------
  // INSERT
  // ---------------------------------------------------------------------------

  console.log(
    "Creating new subscription for:",
    userId
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

  // ---------------------------------------------------------------------------
  // CORS
  // ---------------------------------------------------------------------------

  if (
    req.method === "OPTIONS"
  ) {
    return new Response(
      "ok",
      {
        headers:
          corsHeaders,
      }
    );
  }


  try {

    // -------------------------------------------------------------------------
    // DATABASE KEY
    // -------------------------------------------------------------------------

    if (!DB_KEY) {
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


    // -------------------------------------------------------------------------
    // READ BODY
    // -------------------------------------------------------------------------

    let body;

    try {
      body =
        await req.json();

    } catch (_) {

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


    console.log(
      "========== VERIFY GOOGLE PLAY =========="
    );


    // -------------------------------------------------------------------------
    // PLATFORM
    // -------------------------------------------------------------------------

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


    // -------------------------------------------------------------------------
    // PURCHASE DATA
    // -------------------------------------------------------------------------

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


    // -------------------------------------------------------------------------
    // USER ID
    // -------------------------------------------------------------------------

    const userId =
      body?.userId ||
      body?.user_id;


    console.log(
      "packageName:",
      packageName
    );

    console.log(
      "productId:",
      productId
    );

    console.log(
      "userId:",
      userId
    );

    console.log(
      "purchaseToken received:",
      !!purchaseToken
    );


    // -------------------------------------------------------------------------
    // VALIDATE PURCHASE DATA
    // -------------------------------------------------------------------------

    if (
      !packageName ||
      !productId ||
      !purchaseToken
    ) {

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


    // -------------------------------------------------------------------------
    // VALIDATE USER ID
    // -------------------------------------------------------------------------

    if (
      !isUuid(userId)
    ) {

      return json(
        {
          success:
            false,

          error:
            "Invalid userId.",

          message:
            "A valid authenticated user UUID must be provided.",

          received: {
            userId:
              userId || null,

            isUuid:
              false,
          },
        },
        400
      );
    }


    // -------------------------------------------------------------------------
    // VERIFY GOOGLE PURCHASE
    // -------------------------------------------------------------------------

    const purchase =
      await verifyGooglePlayPurchase(
        packageName,
        productId,
        purchaseToken
      );


    console.log(
      "Google purchase verified:",
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
      })
    );


    // -------------------------------------------------------------------------
    // SUBSCRIPTION DATA
    // -------------------------------------------------------------------------

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


    // -------------------------------------------------------------------------
    // SAVE DATABASE
    // -------------------------------------------------------------------------

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


    console.log(
      "Subscription saved successfully for user:",
      userId
    );


    // -------------------------------------------------------------------------
    // SUCCESS
    // -------------------------------------------------------------------------

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
      }
    );

  } catch (error) {

    console.error(
      "verify-google-play ERROR:",
      error
    );

    return json(
      {
        success:
          false,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
});