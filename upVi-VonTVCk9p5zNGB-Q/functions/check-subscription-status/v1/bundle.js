// check-subscription-status
//
// Queries Stripe directly (using the checkout session_id or a known
// subscription_id) and upserts the latest subscription state into the
// `subscriptions` table. This is the fallback path for cases where the
// asynchronous `stripe-webhook` hasn't yet activated the row (or webhooks
// aren't configured at all).
//
// IMPORTANT: This function ALWAYS returns HTTP 200 with a JSON body that
// carries an `ok` flag. Returning non-2xx status codes for "not yet ready"
// or for ordinary configuration issues would trip the Famous.ai gateway's
// circuit breaker and lock the function out for ~15 minutes. By keeping the
// HTTP layer healthy (200 OK with structured payload) and signalling errors
// via the JSON body, we avoid those false-positive breaker trips while still
// letting the frontend handle every case explicitly.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Helper: ALWAYS respond with HTTP 200 so the gateway circuit breaker
// doesn't see this function as "failing". The actual success/failure is
// communicated in the JSON body's `ok` field.
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

function planFromSubscription(sub: Stripe.Subscription): 'monthly' | 'yearly' {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  if (interval === 'year') return 'yearly';
  return 'monthly';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // -----------------------------------------------------------------
    // Configuration / auth checks — return ok=false rather than 5xx
    // to keep the circuit breaker happy.
    // -----------------------------------------------------------------
    if (!STRIPE_SECRET_KEY) {
      return ok({ ok: false, status: 'unconfigured', error: 'STRIPE_SECRET_KEY not set' });
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return ok({ ok: false, status: 'unconfigured', error: 'Supabase service credentials not set' });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '').trim();
    if (!jwt) {
      return ok({ ok: false, status: 'unauthenticated', error: 'Missing Authorization header' });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve the caller's user from the bearer token.
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return ok({ ok: false, status: 'unauthenticated', error: userErr?.message ?? 'Invalid token' });
    }
    const user = userData.user;

    // -----------------------------------------------------------------
    // Parse body — accept either session_id (preferred, returned by the
    // checkout redirect) or subscription_id.
    // -----------------------------------------------------------------
    let body: { session_id?: string; subscription_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // -----------------------------------------------------------------
    // Resolve a Stripe.Subscription object from whatever the caller sent.
    // -----------------------------------------------------------------
    let sub: Stripe.Subscription | null = null;
    let customerId: string | null = null;

    if (body.session_id) {
      try {
        const session = await stripe.checkout.sessions.retrieve(body.session_id, {
          expand: ['subscription', 'customer'],
        });
        customerId =
          typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
        const s =
          typeof session.subscription === 'object' ? session.subscription : null;
        if (s) {
          sub = s as Stripe.Subscription;
        } else if (typeof session.subscription === 'string') {
          sub = await stripe.subscriptions.retrieve(session.subscription);
        }
      } catch (e) {
        console.warn('[check-subscription-status] session retrieve failed', (e as Error).message);
      }
    }

    if (!sub && body.subscription_id) {
      try {
        sub = await stripe.subscriptions.retrieve(body.subscription_id);
        customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
      } catch (e) {
        console.warn('[check-subscription-status] sub retrieve failed', (e as Error).message);
      }
    }

    // Fallback: look up the customer by user metadata in existing rows,
    // then list their subscriptions on Stripe.
    if (!sub) {
      const { data: existing } = await supabaseAdmin
        .from('subscriptions')
        .select('stripe_customer_id, stripe_subscription_id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.stripe_subscription_id) {
        try {
          sub = await stripe.subscriptions.retrieve(existing.stripe_subscription_id);
          customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
        } catch (e) {
          console.warn('[check-subscription-status] existing sub retrieve failed', (e as Error).message);
        }
      } else if (existing?.stripe_customer_id) {
        try {
          const list = await stripe.subscriptions.list({
            customer: existing.stripe_customer_id,
            status: 'all',
            limit: 1,
          });
          sub = list.data[0] ?? null;
          customerId = existing.stripe_customer_id;
        } catch (e) {
          console.warn('[check-subscription-status] sub list failed', (e as Error).message);
        }
      }
    }

    if (!sub) {
      // Not an error — caller should keep polling. Return ok=true with
      // status='pending' so the frontend doesn't treat this as a failure.
      return ok({
        ok: true,
        status: 'pending',
        message: 'No subscription found yet — Stripe may still be processing the payment.',
      });
    }

    // -----------------------------------------------------------------
    // Upsert into `subscriptions`. We treat (user_id, stripe_subscription_id)
    // as the natural key.
    // -----------------------------------------------------------------
    const plan = planFromSubscription(sub);
    const stripeCustomerId =
      customerId ?? (typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null);

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

    // Try update by stripe_subscription_id first, insert if no row.
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('subscriptions')
      .update(row)
      .eq('stripe_subscription_id', sub.id)
      .select('id');

    if (updErr) {
      console.warn('[check-subscription-status] update error', updErr.message);
    }

    if (!updated || updated.length === 0) {
      const { error: insErr } = await supabaseAdmin.from('subscriptions').insert({
        ...row,
        created_at: new Date().toISOString(),
      });
      if (insErr) {
        // Likely a unique conflict on (user_id) — retry as update by user_id.
        console.warn('[check-subscription-status] insert error, retrying update by user_id', insErr.message);
        const { error: retryErr } = await supabaseAdmin
          .from('subscriptions')
          .update(row)
          .eq('user_id', user.id);
        if (retryErr) {
          console.error('[check-subscription-status] retry update by user_id failed', retryErr.message);
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
    // Defensive catch — never throw a 5xx, never trip the breaker.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[check-subscription-status] unexpected error', message);
    return ok({ ok: false, status: 'error', error: message });
  }
});
