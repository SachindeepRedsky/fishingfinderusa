// check-subscription-status
// -----------------------------------------------------------------------------
// Active-pull from Stripe → upserts the `subscriptions` table.
//
// Runs successfully under BOTH:
//   • Real Supabase Edge Runtime (Deno).
//   • Famous.ai gateway isolated-vm runtime.
//
// To stay portable across those two runtimes we:
//   • Use ONLY built-in `fetch` (no SDK imports, no esm.sh modules — those
//     bundles can reference unguarded `Deno` globals and crash the
//     isolated-vm with "Deno is not defined").
//   • Talk to Stripe via the public REST API directly.
//   • Talk to Supabase via the PostgREST + GoTrue REST APIs directly,
//     using the service-role key for table writes and the user's JWT
//     for identity resolution.
//   • Read env vars through a cross-runtime helper (Deno.env OR
//     globalThis.process.env OR globalThis.__env__).
//
// ALWAYS returns HTTP 200 — failure detail goes in the JSON body's `ok`
// flag — so the gateway's circuit breaker never trips.
// -----------------------------------------------------------------------------

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// Cross-runtime env accessor.
// ---------------------------------------------------------------------------
function getEnv(key: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis as any;
    if (g.Deno && typeof g.Deno.env?.get === 'function') {
      const v = g.Deno.env.get(key);
      if (typeof v === 'string' && v) return v;
    }
    if (g.process?.env && typeof g.process.env[key] === 'string') {
      return g.process.env[key];
    }
    if (g.__env__ && typeof g.__env__[key] === 'string') {
      return g.__env__[key];
    }
  } catch {
    /* ignore */
  }
  return '';
}

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function toIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds || typeof unixSeconds !== 'number') return null;
  return new Date(unixSeconds * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Stripe REST helper (GET only — we never mutate Stripe state here).
// ---------------------------------------------------------------------------
async function stripeGet(
  path: string,
  secretKey: string,
  query?: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = new URL(`https://api.stripe.com/v1/${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.append(k, v);
    }
  }
  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

// ---------------------------------------------------------------------------
// Supabase REST helpers (PostgREST + GoTrue). No SDK; just fetch.
// ---------------------------------------------------------------------------
async function gotrueGetUser(
  supabaseUrl: string,
  anonKey: string,
  jwt: string,
): Promise<{ id: string; email?: string } | null> {
  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  if (!data?.id) return null;
  return { id: data.id, email: data.email };
}

async function pgSelectLatestSubscription(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<{ stripe_customer_id: string | null; stripe_subscription_id: string | null } | null> {
  const url = new URL(`${supabaseUrl}/rest/v1/subscriptions`);
  url.searchParams.set('select', 'stripe_customer_id,stripe_subscription_id');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('order', 'updated_at.desc');
  url.searchParams.set('limit', '1');
  const resp = await fetch(url.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!resp.ok) return null;
  const arr = await resp.json().catch(() => []);
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
}

async function pgUpdateBySubId(
  supabaseUrl: string,
  serviceKey: string,
  subscriptionId: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const url = new URL(`${supabaseUrl}/rest/v1/subscriptions`);
  url.searchParams.set('stripe_subscription_id', `eq.${subscriptionId}`);
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
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false, count: 0, error: text };
  }
  const arr = await resp.json().catch(() => []);
  return { ok: true, count: Array.isArray(arr) ? arr.length : 0 };
}

async function pgUpdateByUserId(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const url = new URL(`${supabaseUrl}/rest/v1/subscriptions`);
  url.searchParams.set('user_id', `eq.${userId}`);
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
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false, count: 0, error: text };
  }
  const arr = await resp.json().catch(() => []);
  return { ok: true, count: Array.isArray(arr) ? arr.length : 0 };
}

async function pgInsert(
  supabaseUrl: string,
  serviceKey: string,
  row: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
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
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false, error: text };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Core handler.
// ---------------------------------------------------------------------------
async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = getEnv('STRIPE_SECRET_KEY');
    const SUPABASE_URL = getEnv('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_ANON_KEY =
      getEnv('SUPABASE_ANON_KEY') || SUPABASE_SERVICE_ROLE_KEY;

    if (!STRIPE_SECRET_KEY) {
      return ok({
        ok: false,
        status: 'unconfigured',
        error: 'STRIPE_SECRET_KEY not set',
      });
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return ok({
        ok: false,
        status: 'unconfigured',
        error: 'Supabase service credentials not set',
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '').trim();
    if (!jwt) {
      return ok({
        ok: false,
        status: 'unauthenticated',
        error: 'Missing Authorization header',
      });
    }

    // Resolve user via GoTrue REST.
    const user = await gotrueGetUser(SUPABASE_URL, SUPABASE_ANON_KEY, jwt);
    if (!user) {
      return ok({
        ok: false,
        status: 'unauthenticated',
        error: 'Invalid or expired token',
      });
    }

    let body: { session_id?: string; subscription_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    let sub: any = null;
    let customerId: string | null = null;

    if (body.session_id) {
      const r = await stripeGet(
        `checkout/sessions/${encodeURIComponent(body.session_id)}`,
        STRIPE_SECRET_KEY,
        { 'expand[]': 'subscription' },
      );
      if (r.ok) {
        const session = r.data;
        customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id ?? null;
        if (session.subscription && typeof session.subscription === 'object') {
          sub = session.subscription;
        } else if (typeof session.subscription === 'string') {
          const sr = await stripeGet(
            `subscriptions/${encodeURIComponent(session.subscription)}`,
            STRIPE_SECRET_KEY,
          );
          if (sr.ok) sub = sr.data;
        }
      } else {
        console.warn(
          '[check-subscription-status] session retrieve failed',
          r.status,
          r.data?.error?.message,
        );
      }
    }

    if (!sub && body.subscription_id) {
      const r = await stripeGet(
        `subscriptions/${encodeURIComponent(body.subscription_id)}`,
        STRIPE_SECRET_KEY,
      );
      if (r.ok) {
        sub = r.data;
        customerId =
          typeof sub.customer === 'string'
            ? sub.customer
            : sub.customer?.id ?? null;
      } else {
        console.warn(
          '[check-subscription-status] sub retrieve failed',
          r.status,
          r.data?.error?.message,
        );
      }
    }

    if (!sub) {
      // Fallback: look up an existing customer/sub for this user via REST.
      const existing = await pgSelectLatestSubscription(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        user.id,
      );
      if (existing?.stripe_subscription_id) {
        const r = await stripeGet(
          `subscriptions/${encodeURIComponent(existing.stripe_subscription_id)}`,
          STRIPE_SECRET_KEY,
        );
        if (r.ok) {
          sub = r.data;
          customerId =
            typeof sub.customer === 'string'
              ? sub.customer
              : sub.customer?.id ?? null;
        }
      } else if (existing?.stripe_customer_id) {
        const r = await stripeGet('subscriptions', STRIPE_SECRET_KEY, {
          customer: existing.stripe_customer_id,
          status: 'all',
          limit: '1',
        });
        if (r.ok) {
          sub = r.data?.data?.[0] ?? null;
          customerId = existing.stripe_customer_id;
        }
      }
    }

    if (!sub) {
      return ok({
        ok: true,
        status: 'pending',
        message:
          'No subscription found yet — Stripe may still be processing the payment.',
      });
    }

    const interval = sub?.items?.data?.[0]?.price?.recurring?.interval;
    const plan: 'monthly' | 'yearly' = interval === 'year' ? 'yearly' : 'monthly';
    const stripeCustomerId =
      customerId ??
      (typeof sub.customer === 'string'
        ? sub.customer
        : sub.customer?.id ?? null);

    const row = {
      user_id: user.id,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      plan,
      current_period_start: toIso(sub.current_period_start),
      current_period_end: toIso(sub.current_period_end),
      updated_at: new Date().toISOString(),
    };

    // Try update by stripe_subscription_id first.
    const upd = await pgUpdateBySubId(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      sub.id,
      row,
    );

    if (upd.count === 0) {
      // No existing row — insert.
      const ins = await pgInsert(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        ...row,
        created_at: new Date().toISOString(),
      });
      if (!ins.ok) {
        // Likely unique conflict on user_id — retry update by user_id.
        console.warn(
          '[check-subscription-status] insert failed, retrying update by user_id',
          ins.error,
        );
        const retry = await pgUpdateByUserId(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
          user.id,
          row,
        );
        if (!retry.ok) {
          return ok({
            ok: false,
            status: 'db_error',
            error: retry.error,
            stripe_status: sub.status,
            plan,
          });
        }
      }
    }

    return ok({
      ok: true,
      status: sub.status,
      plan,
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
// Dual-runtime registration. Guarded so referencing `Deno` in an
// environment where it's undefined (isolated-vm) doesn't throw a top-level
// ReferenceError.
// ---------------------------------------------------------------------------
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  if (g.Deno && typeof g.Deno.serve === 'function') {
    g.Deno.serve(handler);
  }
} catch {
  /* swallow — gateway will pick up the default export */
}

export default handler;
