// check-subscription-status
// Cross-runtime: works in Deno (Supabase Edge Runtime) and isolated-vm gateway.
// NO ESM syntax. NO external imports. NO "ex" + "port" keyword anywhere in source.

var corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getEnv(key) {
  try {
    var g = globalThis;
    if (g.Deno && g.Deno.env && typeof g.Deno.env.get === 'function') {
      var v = g.Deno.env.get(key);
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
  var url = new URL('https://api.stripe.com/v1/' + path);
  if (query) {
    for (var k in query) {
      if (Object.prototype.hasOwnProperty.call(query, k)) url.searchParams.append(k, query[k]);
    }
  }
  var resp = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + secretKey },
  });
  var data = await resp.json().catch(function () { return {}; });
  return { ok: resp.ok, status: resp.status, data: data };
}

async function gotrueGetUser(supabaseUrl, anonKey, jwt) {
  var resp = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: { apikey: anonKey, Authorization: 'Bearer ' + jwt },
  });
  if (!resp.ok) return null;
  var data = await resp.json().catch(function () { return null; });
  if (!data || !data.id) return null;
  return { id: data.id, email: data.email };
}

async function pgSelectLatest(supabaseUrl, serviceKey, userId) {
  var url = new URL(supabaseUrl + '/rest/v1/subscriptions');
  url.searchParams.set('select', 'stripe_customer_id,stripe_subscription_id');
  url.searchParams.set('user_id', 'eq.' + userId);
  url.searchParams.set('order', 'updated_at.desc');
  url.searchParams.set('limit', '1');
  var resp = await fetch(url.toString(), {
    headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
  });
  if (!resp.ok) return null;
  var arr = await resp.json().catch(function () { return []; });
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
}

async function pgPatch(supabaseUrl, serviceKey, filterKey, filterValue, patch) {
  var url = new URL(supabaseUrl + '/rest/v1/subscriptions');
  url.searchParams.set(filterKey, 'eq.' + filterValue);
  var resp = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) return { ok: false, count: 0, error: await resp.text().catch(function () { return ''; }) };
  var arr = await resp.json().catch(function () { return []; });
  return { ok: true, count: Array.isArray(arr) ? arr.length : 0 };
}

async function pgInsert(supabaseUrl, serviceKey, row) {
  var resp = await fetch(supabaseUrl + '/rest/v1/subscriptions', {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!resp.ok) return { ok: false, error: await resp.text().catch(function () { return ''; }) };
  return { ok: true };
}

async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    var STRIPE_SECRET_KEY = getEnv('STRIPE_SECRET_KEY');
    var SUPABASE_URL = getEnv('SUPABASE_URL');
    var SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    var SUPABASE_ANON_KEY = getEnv('SUPABASE_ANON_KEY') || SUPABASE_SERVICE_ROLE_KEY;

    if (!STRIPE_SECRET_KEY) return ok({ ok: false, status: 'unconfigured', error: 'STRIPE_SECRET_KEY not set' });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return ok({ ok: false, status: 'unconfigured', error: 'Supabase service credentials not set' });

    var jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!jwt) return ok({ ok: false, status: 'unauthenticated', error: 'Missing Authorization header' });

    var user = await gotrueGetUser(SUPABASE_URL, SUPABASE_ANON_KEY, jwt);
    if (!user) return ok({ ok: false, status: 'unauthenticated', error: 'Invalid or expired token' });

    var body = {};
    try { body = await req.json(); } catch (_) { body = {}; }

    var sub = null;
    var customerId = null;

    if (body.session_id) {
      var r = await stripeGet('checkout/sessions/' + encodeURIComponent(body.session_id), STRIPE_SECRET_KEY, { 'expand[]': 'subscription' });
      if (r.ok) {
        var session = r.data;
        customerId = typeof session.customer === 'string' ? session.customer : (session.customer && session.customer.id) || null;
        if (session.subscription && typeof session.subscription === 'object') {
          sub = session.subscription;
        } else if (typeof session.subscription === 'string') {
          var sr = await stripeGet('subscriptions/' + encodeURIComponent(session.subscription), STRIPE_SECRET_KEY);
          if (sr.ok) sub = sr.data;
        }
      }
    }

    if (!sub && body.subscription_id) {
      var r2 = await stripeGet('subscriptions/' + encodeURIComponent(body.subscription_id), STRIPE_SECRET_KEY);
      if (r2.ok) {
        sub = r2.data;
        customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null;
      }
    }

    if (!sub) {
      var existing = await pgSelectLatest(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, user.id);
      if (existing && existing.stripe_subscription_id) {
        var r3 = await stripeGet('subscriptions/' + encodeURIComponent(existing.stripe_subscription_id), STRIPE_SECRET_KEY);
        if (r3.ok) {
          sub = r3.data;
          customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null;
        }
      } else if (existing && existing.stripe_customer_id) {
        var r4 = await stripeGet('subscriptions', STRIPE_SECRET_KEY, {
          customer: existing.stripe_customer_id, status: 'all', limit: '1',
        });
        if (r4.ok) {
          sub = (r4.data && r4.data.data && r4.data.data[0]) || null;
          customerId = existing.stripe_customer_id;
        }
      }
    }

    if (!sub) {
      return ok({ ok: true, status: 'pending', message: 'No subscription found yet — Stripe may still be processing the payment.' });
    }

    var interval = sub && sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.recurring && sub.items.data[0].price.recurring.interval;
    var plan = interval === 'year' ? 'yearly' : 'monthly';
    var stripeCustomerId = customerId || (typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null);

    var row = {
      user_id: user.id,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      plan: plan,
      current_period_start: toIso(sub.current_period_start),
      current_period_end: toIso(sub.current_period_end),
      updated_at: new Date().toISOString(),
    };

    var upd = await pgPatch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'stripe_subscription_id', sub.id, row);
    if (upd.count === 0) {
      var insertRow = Object.assign({}, row, { created_at: new Date().toISOString() });
      var ins = await pgInsert(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, insertRow);
      if (!ins.ok) {
        var retry = await pgPatch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 'user_id', user.id, row);
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
    var message = err && err.message ? err.message : String(err);
    try { console.error('[check-subscription-status] unexpected error', message); } catch (_) {}
    return ok({ ok: false, status: 'error', error: message });
  }
}

// Dual-runtime registration. NO ESM keywords used.
try {
  var __g = globalThis;
  if (__g.Deno && typeof __g.Deno.serve === 'function') __g.Deno.serve(handler);
  __g.handler = handler;
  __g['default'] = handler;
} catch (_) {}

try {
  if (typeof module !== 'undefined' && module) {
    module['exports'] = handler;
    module['exports']['default'] = handler;
    module['exports']['handler'] = handler;
  }
} catch (_) {}
