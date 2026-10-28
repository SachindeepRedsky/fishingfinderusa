// check-subscription-status
// -----------------------------------------------------------------------------
// Active-pull from Stripe → upserts the `subscriptions` table.
// Works under both Supabase Edge Runtime (Deno) and the Famous.ai gateway
// isolated-vm runner. Uses ONLY built-in fetch (no SDK imports) and a
// cross-runtime env accessor. ALWAYS returns HTTP 200 with structured JSON
// so the gateway's circuit breaker never trips.
// -----------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getEnv(key) {
  try {
    const g = globalThis;
    if (g.Deno && g.Deno.env && typeof g.Deno.env.get === 'function') {
      const v = g.Deno.env.get(key);
      if (typeof v === 'string' && v) return v;
    }
    if (g.process && g.process.env && typeof g.process.env[key] === 'string') return g.process.env[key];
    if (g.__env__ && typeof g.__env__[key] === 'string') return g.__env__[key];
  } catch (_) {}
  return '';
}

function ok(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function toIso(unixSeconds) {
  if (!unixSeconds || typeof unixSeconds !== 'number') return null;
  return new Date(unixSeconds * 1000).toISOString();
}

async function stripeGet(path, secretKey, query) {
  const url = new URL(`https://api.stripe.com/v1/${path}`);
  if (query) for (const k of Object.keys(query)) url.searchParams.append(k, query[k]);
  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

async function gotrueGetUser(supabaseUrl, anonKey, jwt) {
  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  if (!data || !data.id) return null;
  return { id: data.id, email: data.email };
}

async function pgSelectLatest(supabaseUrl, serviceKey, userId) {
  const url = new URL(`${supabaseUrl}/rest/v1/subscriptions`);
  url.searchParams.set('select', 'stripe_customer_id,stripe_subscription_id');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('order', 'updated_at.desc');
  url.searchParams.set('limit', '1');
  const resp = await fetch(url.toString(), {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!resp.ok) return null;
  const arr = await resp.json().catch(() => []);
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
}

async function pgPatch(supabaseUrl, serviceKey, filterKey, filterValue, patch) {
  const url = new URL(`${supabaseUrl}/rest/v1/subscriptions`);
  url.searchParams.set(filterKey, `eq.${filterValue}`);
  const resp = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) return { ok: false, count: 0, error: await resp.text().catch(() => '') };
  const arr = await resp.json().catch(() => []);
  return { ok: true, count: Array.isArray(arr) ? arr.length : 0 };
}

async function pgInsert(supabaseUrl, serviceKey, row) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!resp.ok) return { ok: false, error: await resp.text().catch(() => '') };
  return { ok: true };
}

async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const STRIPE_SECRET_KEY = getEnv('STRIPE_SECRET_KEY');
    const SUPABASE_URL = getEnv('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_ANON_KEY = getEnv('SUPABASE_ANON_KEY') || SUPABASE_SERVICE_ROLE_KEY;

    if (!STRIPE_SECRET_KEY) return ok({ ok: false, status: 'unconfigured', error: 'STRIPE_SECRET_KEY not set' });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return ok({ ok: false, status: 'unconfigured', error: 'Supabase service credentials not set' });

    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!jwt) return ok({ ok: false, status: 'unauthenticated', error: 'Missing Authorization header' });

    const user = await gotrueGetUser(SUPABASE_URL, SUPABASE_ANON_KEY, jwt);
    if (!user) return ok({ ok: false, status: 'unauthenticated', error: 'Invalid or expired token' });

    let body = {};
    try { body = await req.json(); } catch (_) { body = {}; }

    let sub = null;
    let customerId = null;

    if (body.session_id) {
      const r = await stripeGet(`checkout/sessions/${encodeURIComponent(body.session_id)}`, STRIPE_SECRET_KEY, { 'expand[]': 'subscription' });
      if (r.ok) {
        const session = r.data;
        customerId = typeof session.customer === 'string' ? session.customer : (session.customer && session.customer.id) || null;
        if (session.subscription && typeof session.subscription === 'object') {
          sub = session.subscription;
        } else if (typeof session.subscription === 'string') {
          const sr = await stripeGet(`subscriptions/${encodeURIComponent(session.subscription)}`, STRIPE_SECRET_KEY);
          if (sr.ok) sub = sr.data;
        }
      }
    }

    if (!sub && body.subscription_id) {
      const r = await stripeGet(`subscriptions/${encodeURIComponent(body.subscription_id)}`, STRIPE_SECRET_KEY);
      if (r.ok) {
        sub = r.data;
        customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null;
      }
    }

    if (!sub) {
      const existing = await pgSelectLatest(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, user.id);
      if (existing && existing.stripe_subscription_id) {
        const r = await stripeGet(`subscriptions/${encodeURIComponent(existing.stripe_subscription_id)}`, STRIPE_SECRET_KEY);
        if (r.ok) {
          sub = r.data;
          customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null;
        }
      } else if (existing && existing.stripe_customer_id) {
        const r = await stripeGet('subscriptions', STRIPE_SECRET_KEY, {
          customer: existing.stripe_customer_id, status: 'all', limit: '1',
        });
        if (r.ok) {
          sub = (r.data && r.data.data && r.data.data[0]) || null;
          customerId = existing.stripe_customer_id;
        }
      }
    }

    if (!sub) {
      return ok({ ok: true, status: 'pending', message: 'No subscription found yet — Stripe may still be processing the payment.' });
    }

    const interval = sub && sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.recurring && sub.items.data[0].price.recurring.interval;
    const plan = interval === 'year' ? 'yearly' : 'monthly';
    const stripeCustomerId = customerId || (typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null);

    const row = {
      user_id: user.id,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      plan: plan,
      current_period_start: toIso(sub.current_period_start),
      current_period_end: toIso(sub.current_period_end),
      updated_at: new Date().toISOString(),
    };

    const upd = await pgPatch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'stripe_subscription_id', sub.id, row);
    if (upd.count === 0) {
      const ins = await pgInsert(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { ...row, created_at: new Date().toISOString() });
      if (!ins.ok) {
        const retry = await pgPatch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'user_id', user.id, row);
        if (!retry.ok) {
          return ok({ ok: false, status: 'db_error', error: retry.error, stripe_status: sub.status, plan: plan });
        }
      }
    }

    return ok({
      ok: true,
      status: sub.status,
      plan: plan,
      stripe_subscription_id: sub.id,
      current_period_end: toIso(sub.current_period_end),
      active: sub.status === 'active' || sub.status === 'trialing',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[check-subscription-status] unexpected error', message);
    return ok({ ok: false, status: 'error', error: message });
  }
}

// ---------------------------------------------------------------------------
// Dual-runtime registration.
// ---------------------------------------------------------------------------
try {
  const g = globalThis;
  if (g.Deno && typeof g.Deno.serve === 'function') g.Deno.serve(handler);
  g.handler = handler;
} catch (_) {}

// CJS interop for the Famous.ai isolated-vm gateway (which looks for
// module.exports.default). Done via dynamic property access so this file
// also works as an ESM module on real Deno.
try {
  // eslint-disable-next-line no-undef
  if (typeof module !== 'undefined' && module) {
    // eslint-disable-next-line no-undef
    module.exports = handler;
    // eslint-disable-next-line no-undef
    module.exports.default = handler;
    // eslint-disable-next-line no-undef
    module.exports.handler = handler;
  }
} catch (_) {}

export default handler;
export { handler };
