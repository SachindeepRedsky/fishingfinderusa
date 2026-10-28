// =============================================================================
// verify-google-play
// -----------------------------------------------------------------------------
// Verifies a Google Play subscription purchase token with the Android Publisher
// API and writes the result into the `subscriptions` table so the app instantly
// sees the user as Pro.
//
// Fixes:
//  1. JWT signing now uses Web Crypto (the old code used Node `Buffer` +
//     `require('node:crypto')`, which do not exist here, so it always threw).
//  2. Plain JS only — no TS interfaces/casts (matches the runtime used by the
//     other working functions).
//  3. DB write uses the verified select -> update-or-insert flow (NOT
//     on_conflict, which this REST layer rejects with 42P10).
//  4. Supports purchases.subscriptionsv2 (new base-plan model) with fallback to
//     the legacy purchases.subscriptions endpoint.
//  5. Acknowledges the purchase with Google (unacknowledged purchases are
//     auto-refunded after 3 days).
// =============================================================================


function getEnv(key: string): string {
  try {
    const g: any = globalThis;
    if (g.Deno?.env?.get) {
      const value = g.Deno.env.get(key);
      if (typeof value === "string") return value.trim();
    }
    if (typeof g.process?.env?.[key] === "string") {
      return g.process.env[key].trim();
    }
  } catch (_) {
    // ignore
  }
  return "";
}

const PROJECT_URL = 'https://erbligiwkdfwxkhvwepw.databasepad.com';
const REST_URL = `${PROJECT_URL}/rest/v1`;


const DB_KEY =
  getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
  getEnv("SERVICE_ROLE_KEY") ||
  getEnv("SUPABASE_ANON_KEY") ||
  getEnv("ANON_KEY");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function dbHeaders() {
  return {
    apikey: DB_KEY,
    Authorization: `Bearer ${DB_KEY}`,
    'Content-Type': 'application/json',
  };
}

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function planFromProductId(productId) {
  if (!productId) return 'monthly';
  if (/year|annual/i.test(productId)) return 'yearly';
  if (/month/i.test(productId)) return 'monthly';
  return 'monthly';
}

// ---------------------------------------------------------------------------
// base64url helpers (no Node Buffer)
// ---------------------------------------------------------------------------
function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function base64UrlFromBytes(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromString(input) {
  return base64UrlFromBytes(new TextEncoder().encode(input));
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pemToPkcs8Bytes(pem) {
  const normalized = String(pem).replace(/\\n/g, '\n').trim();
  const body = normalized
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, '')
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('Google service account private_key is empty or malformed.');
  return base64ToBytes(body);
}

// ---------------------------------------------------------------------------
// Google OAuth: service account -> access token (Web Crypto RS256)
// ---------------------------------------------------------------------------
let cachedToken = null;

async function getGoogleAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const serviceAccountJson = getEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountJson) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured.');
  }

  let credentials;
  try {
    credentials = JSON.parse(serviceAccountJson);
  } catch (_) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }

  const clientEmail = credentials.client_email;
  const privateKeyPem = credentials.private_key;
  if (!clientEmail || !privateKeyPem) {
    throw new Error('Google service account credentials are incomplete (client_email / private_key missing).');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlFromString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlFromString(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8Bytes(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${base64UrlFromBytes(new Uint8Array(signatureBuffer))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Failed to fetch Google access token.');
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in || 3600) * 1000),
  };
  return cachedToken.token;
}

// ---------------------------------------------------------------------------
// Google Play verification
// ---------------------------------------------------------------------------
async function playFetch(url, accessToken, init) {
  const options = init || {};
  const response = await fetch(url, {
    method: options.method || 'GET',
    body: options.body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = { raw: text };
  }
  return { ok: response.ok, status: response.status, body };
}

function normalizeV2(raw, fallbackProductId) {
  const line = Array.isArray(raw && raw.lineItems) && raw.lineItems.length > 0 ? raw.lineItems[0] : null;
  const expiry = line && line.expiryTime ? Date.parse(line.expiryTime) : 0;
  const start = raw && raw.startTime ? Date.parse(raw.startTime) : 0;
  const state = String((raw && raw.subscriptionState) || '');
  const activeStates = [
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    'SUBSCRIPTION_STATE_CANCELED', // cancelled but still paid through expiry
  ];
  return {
    apiVersion: 'v2',
    active: activeStates.indexOf(state) !== -1 && expiry > Date.now(),
    state,
    expiryTimeMillis: expiry || 0,
    startTimeMillis: start || 0,
    autoRenewing: !!(line && line.autoRenewingPlan && line.autoRenewingPlan.autoRenewEnabled),
    productId: (line && line.productId) || fallbackProductId || null,
    acknowledged: String((raw && raw.acknowledgementState) || '') === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    raw,
  };
}

function normalizeV1(raw, fallbackProductId) {
  const expiry = Number((raw && raw.expiryTimeMillis) || 0);
  const start = Number((raw && raw.startTimeMillis) || 0);
  // paymentState: 0 pending, 1 received, 2 free trial, 3 pending deferred
  const paymentState = raw && raw.paymentState === undefined ? 1 : Number(raw.paymentState);
  return {
    apiVersion: 'v1',
    active: expiry > Date.now() && [1, 2, 3].indexOf(paymentState) !== -1,
    state: `paymentState:${paymentState}`,
    expiryTimeMillis: expiry,
    startTimeMillis: start,
    autoRenewing: !!(raw && raw.autoRenewing),
    productId: fallbackProductId || null,
    acknowledged: Number(raw && raw.acknowledgementState !== undefined ? raw.acknowledgementState : 1) === 1,
    raw,
  };
}

async function maybeAcknowledge(accessToken, packageName, productId, purchaseToken, purchase) {
  if (!purchase.active || purchase.acknowledged) return;
  try {
    await playFetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      accessToken,
      { method: 'POST', body: JSON.stringify({}) },
    );
  } catch (err) {
    console.error('Acknowledge failed (non-fatal):', err);
  }
}

async function verifyGooglePlayPurchase(packageName, productId, purchaseToken) {
  const accessToken = await getGoogleAccessToken();
  const pkg = encodeURIComponent(packageName);
  const token = encodeURIComponent(purchaseToken);

  const v2 = await playFetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/subscriptionsv2/tokens/${token}`,
    accessToken,
  );

  if (v2.ok) {
    const normalized = normalizeV2(v2.body, productId);
    await maybeAcknowledge(accessToken, packageName, productId, purchaseToken, normalized);
    return normalized;
  }

  const v1 = await playFetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${token}`,
    accessToken,
  );

  if (v1.ok) {
    const normalized = normalizeV1(v1.body, productId);
    await maybeAcknowledge(accessToken, packageName, productId, purchaseToken, normalized);
    return normalized;
  }

  const message =
    (v2.body && v2.body.error && v2.body.error.message) ||
    (v1.body && v1.body.error && v1.body.error.message) ||
    `Google Play verification failed (v2 HTTP ${v2.status}, v1 HTTP ${v1.status}).`;
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Save subscription: select -> update-or-insert
// ---------------------------------------------------------------------------
async function saveSubscription(userId, fields) {
  const encodedUser = encodeURIComponent(userId);

  const selRes = await fetch(
    `${REST_URL}/subscriptions?user_id=eq.${encodedUser}&select=id&limit=1`,
    { headers: dbHeaders() },
  );
  const selText = await selRes.text();
  if (!selRes.ok) {
    throw new Error(`Subscription lookup failed (HTTP ${selRes.status}): ${selText}`);
  }

  let existing = [];
  try {
    existing = JSON.parse(selText);
  } catch (_) {
    existing = [];
  }

  let res;
  if (Array.isArray(existing) && existing.length > 0) {
    res = await fetch(`${REST_URL}/subscriptions?user_id=eq.${encodedUser}`, {
      method: 'PATCH',
      headers: { ...dbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(fields),
    });
  } else {
    res = await fetch(`${REST_URL}/subscriptions`, {
      method: 'POST',
      headers: { ...dbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId, ...fields }),
    });
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Subscription save failed (HTTP ${res.status}): ${text}`);
  }

  try {
    const rows = JSON.parse(text);
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!DB_KEY) {
      return json({
        success: false,
        message: 'Database API key is not configured (SUPABASE_SERVICE_ROLE_KEY missing).',
      }, 500);
    }

    let body;
    try {
      body = await req.json();
    } catch (_) {
      return json({ success: false, message: 'Invalid JSON request body.' }, 400);
    }

    const platform = body && body.platform ? String(body.platform) : 'google_play';
    if (['google_play', 'android', 'google'].indexOf(platform) === -1) {
      return json({ success: false, message: `Unsupported platform: ${platform}` }, 400);
    }

    const packageName =
      (body && (body.packageName || body.package_name)) ||
      getEnv('GOOGLE_PLAY_PACKAGE_NAME') ||
      'com.fishingfinderusa';
    const productId = body && (body.productId || body.product_id);
    const purchaseToken = body && (body.purchaseToken || body.purchase_token || body.token);

    if (!packageName || !productId || !purchaseToken) {
      return json({
        success: false,
        message: 'packageName, productId, and purchaseToken are required.',
        received: {
          packageName: !!packageName,
          productId: !!productId,
          purchaseToken: !!purchaseToken,
        },
      }, 400);
    }

const userId = body && (body.userId || body.user_id);
    if (!isUuid(userId)) {
      return json({
        success: false,
        message: 'A valid userId (UUID) is required to save the subscription.',
      }, 400);
    }

    

    const purchase = await verifyGooglePlayPurchase(packageName, productId, purchaseToken);

    const status = purchase.active ? 'active' : 'expired';
    const plan = purchase.active ? planFromProductId(purchase.productId || productId) : 'free';
    const currentPeriodEnd = purchase.expiryTimeMillis > 0
      ? new Date(purchase.expiryTimeMillis).toISOString()
      : null;
    const currentPeriodStart = purchase.startTimeMillis > 0
      ? new Date(purchase.startTimeMillis).toISOString()
      : new Date().toISOString();

    // Stripe columns are intentionally omitted so a Play purchase never wipes
    // existing Stripe identifiers on the same row.
    const row = await saveSubscription(userId, {
       status,
      plan,
      current_period_start: purchaseDate,
      current_period_end: expiryDate,
      updated_at: new Date().toISOString(),
    });

    return json({
      success: true,
      active: purchase.active,
      status,
      plan,
      productId: purchase.productId || productId,
      apiVersion: purchase.apiVersion,
      subscriptionState: purchase.state,
      autoRenewing: purchase.autoRenewing,
      expiryTimeMillis: purchase.expiryTimeMillis,
      current_period_end: currentPeriodEnd,
      provider: 'google_play',
      subscription: row,
      message: purchase.active
        ? 'Google Play purchase verified and subscription activated.'
        : 'Google Play purchase verified but the subscription is not active (expired or unpaid).',
    });
  } catch (error) {
    console.error('verify-google-play error:', error);
    return json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
