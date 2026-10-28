function getEnv(key) {
  try {
    const g = globalThis;
    if (g.Deno?.env?.get) {
      const value = g.Deno.env.get(key);
      if (typeof value === 'string') return value.trim();
    }
    if (typeof g.process?.env?.[key] === 'string') {
      return g.process.env[key].trim();
    }
  } catch (_) {
    // ignore
  }
  return '';
}

const PROJECT_URL = 'https://erbligiwkdfwxkhvwepw.databasepad.com';
const REST_URL = `${PROJECT_URL}/rest/v1`;
const SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SERVICE_ROLE_KEY') || getEnv('SUPABASE_ANON_KEY') || getEnv('ANON_KEY');
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function dbHeaders() {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function planFromProductId(productId) {
  if (!productId) return 'unknown';
  if (/monthly|month/i.test(productId)) return 'monthly';
  if (/year|annual/i.test(productId)) return 'yearly';
  return productId;
}

async function saveSubscription(userId, fields) {
  if (!userId || !SERVICE_ROLE_KEY) {
    return null;
  }

  const encodedUser = encodeURIComponent(userId);
  const selRes = await fetch(`${REST_URL}/subscriptions?user_id=eq.${encodedUser}&select=id&limit=1`, {
    headers: dbHeaders(),
  });

  const selText = await selRes.text();
  if (!selRes.ok) {
    throw new Error(`Subscription lookup failed (HTTP ${selRes.status}): ${selText}`);
  }

  let existing = [];
  try {
    existing = JSON.parse(selText);
  } catch {
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
  } catch {
    return null;
  }
}

function getGoogleAccessToken() {
  const serviceAccountJson = getEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountJson) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured.');
  }

  const credentials = JSON.parse(serviceAccountJson);
  const clientEmail = credentials.client_email;
  const privateKey = credentials.private_key;
  if (!clientEmail || !privateKey) {
    throw new Error('Google service account credentials are incomplete.');
  }

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');

  const crypto = require('node:crypto');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  });
  const jwt = `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`;

  return fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error_description || data?.error || 'Failed to fetch Google access token.');
    }
    return data.access_token;
  });
}

async function verifyGooglePlayPurchase({ packageName, productId, purchaseToken }) {
  const accessToken = await getGoogleAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const text = await response.text();
  let result = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { raw: text };
  }

  if (!response.ok) {
    throw new Error(result?.error?.message || result?.message || `Google Play verification failed (HTTP ${response.status}).`);
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!SERVICE_ROLE_KEY) {
      return json({ success: false, message: 'Database API key is not configured.' }, 500);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ success: false, message: 'Invalid JSON request body.' }, 400);
    }

    if (body?.action !== 'verify-google-play' || body?.platform !== 'google_play') {
      return json({ success: false, message: 'Invalid request.' }, 400);
    }

    if (!body.packageName || !body.productId || !body.purchaseToken) {
      return json({ success: false, message: 'packageName, productId, and purchaseToken are required.' }, 400);
    }

    const userId = body.userId || null;
    if (userId && !isUuid(userId)) {
      return json({ success: false, message: 'A valid userId (UUID) is required to save the subscription.' }, 400);
    }

    const googlePurchase = await verifyGooglePlayPurchase({
      packageName: body.packageName,
      productId: body.productId,
      purchaseToken: body.purchaseToken,
    });

    const expiryTimeMillis = Number(googlePurchase.expiryTimeMillis || 0);
    const purchaseState = Number(googlePurchase.purchaseState ?? 0);
    const isPurchased = purchaseState === 0 && expiryTimeMillis > Date.now();
    const status = isPurchased ? 'active' : 'expired';
    const plan = planFromProductId(body.productId || googlePurchase.productId);
    const currentPeriodEnd = expiryTimeMillis > 0 ? new Date(expiryTimeMillis).toISOString() : null;

    const row = userId ? await saveSubscription(userId, {
      status,
      plan,
      provider: 'google_play',
      product_id: body.productId,
      current_period_start: new Date().toISOString(),
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    }) : null;

    return json({
      success: true,
      active: isPurchased,
      status,
      plan,
      productId: body.productId,
      purchaseState,
      expiryTimeMillis,
      provider: 'google_play',
      subscription: row,
      message: 'Google Play purchase verified and subscription saved.',
    });
  } catch (error) {
    console.error('verify-google-play error:', error);
    return json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
