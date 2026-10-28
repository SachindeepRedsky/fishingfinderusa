// check-subscription-status
// -----------------------------------------------------------------------------
// Pulls the latest subscription state directly from Stripe (via raw REST calls,
// no SDK) and upserts it into the `subscriptions` table. This is the
// active-pull fallback for when the asynchronous `stripe-webhook` hasn't yet
// activated the row (or webhooks aren't configured at all).
//
// IMPORTANT:
// - Uses raw `fetch` to the Stripe REST API (matching the proven pattern in
//   `create-checkout-session`). DOES NOT import the Stripe SDK from esm.sh,
//   because that bundle pulls in Node-targeted code that breaks under the
//   Supabase Edge Runtime and causes "Deno is not defined" / user_code_error.
// - ALWAYS responds HTTP 200 with a JSON `{ ok, status, ... }` body, even on
//   errors, so the Famous.ai gateway's circuit breaker never trips.
// -----------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Always respond 200 with structured payload to keep the gateway happy.
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

// Minimal Stripe REST helper using only fetch (Edge-Runtime safe).
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
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_SERVICE_ROLE_KEY =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Resolve caller from bearer token.
    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return ok({
        ok: false,
        status: 'unauthenticated',
        error: userErr?.message ?? 'Invalid token',
      });
    }
    const user = userData.user;

    // Parse body.
    let body: { session_id?: string; subscription_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // -----------------------------------------------------------------------
    // Resolve a Stripe Subscription object via the REST API.
    // -----------------------------------------------------------------------
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

    // Fallback: look up an existing customer/sub for this user.
    if (!sub) {
      const { data: existing } = await supabaseAdmin
        .from('subscriptions')
        .select('stripe_customer_id, stripe_subscription_id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

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
      // Not an error — caller should keep polling.
      return ok({
        ok: true,
        status: 'pending',
        message:
          'No subscription found yet — Stripe may still be processing the payment.',
      });
    }

    // -----------------------------------------------------------------------
    // Build & upsert the row.
    // -----------------------------------------------------------------------
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

    // Update by stripe_subscription_id, otherwise insert.
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('subscriptions')
      .update(row)
      .eq('stripe_subscription_id', sub.id)
      .select('id');

    if (updErr) {
      console.warn(
        '[check-subscription-status] update error',
        updErr.message,
      );
    }

    if (!updated || updated.length === 0) {
      const { error: insErr } = await supabaseAdmin
        .from('subscriptions')
        .insert({ ...row, created_at: new Date().toISOString() });
      if (insErr) {
        // Likely unique conflict on user_id — retry by user_id.
        console.warn(
          '[check-subscription-status] insert error, retrying update by user_id',
          insErr.message,
        );
        const { error: retryErr } = await supabaseAdmin
          .from('subscriptions')
          .update(row)
          .eq('user_id', user.id);
        if (retryErr) {
          console.error(
            '[check-subscription-status] retry update by user_id failed',
            retryErr.message,
          );
          return ok({
            ok: false,
            status: 'db_error',
            error: retryErr.message,
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
});
