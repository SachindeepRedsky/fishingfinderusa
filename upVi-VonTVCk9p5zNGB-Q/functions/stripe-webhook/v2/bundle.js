// Stripe webhook endpoint
// Verifies the Stripe signature using STRIPE_WEBHOOK_SECRET, then keeps the
// `subscriptions` table in sync from server-side events (no reliance on the
// client redirect after Checkout).
//
// Required environment variables (set as Edge Function secrets):
//   STRIPE_SECRET_KEY          - sk_live_... / sk_test_... (used to retrieve subs by id)
//   STRIPE_WEBHOOK_SECRET      - whsec_...   (Stripe Dashboard -> Webhooks -> Signing secret)
//   SUPABASE_URL               - project URL
//   SUPABASE_SERVICE_ROLE_KEY  - service role key for writing the table
//
// Stripe Dashboard endpoint should subscribe to:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted
// (invoice.paid / invoice.payment_failed are handled defensively too)
//
// Table shape (public.subscriptions):
//   id (uuid, pk)
//   user_id (uuid, NOT NULL)               <- from checkout.session.client_reference_id
//   stripe_customer_id (text)
//   stripe_subscription_id (text)          <- our upsert key
//   status (text, NOT NULL)
//   plan (text, NOT NULL)                  <- 'monthly' | 'yearly'
//   current_period_start / current_period_end (timestamptz)
//   created_at / updated_at (timestamptz)

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

// Async crypto provider is required for signature verification in Deno/edge.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function toIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds || typeof unixSeconds !== 'number') return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function planFromSubscription(sub: Stripe.Subscription): 'monthly' | 'yearly' | null {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  if (interval === 'year') return 'yearly';
  if (interval === 'month') return 'monthly';
  return null;
}

// Update an existing row keyed by stripe_subscription_id. Returns true if a row
// was updated, false if no row exists yet (caller can decide to insert).
async function updateByStripeSubId(
  subscriptionId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', subscriptionId)
    .select('id');
  if (error) {
    console.error('[stripe-webhook] update by sub id failed', error);
    throw error;
  }
  return (data?.length ?? 0) > 0;
}

// Upsert a subscription row. We require user_id (NOT NULL in schema), so callers
// must either pass it explicitly (from checkout.session.client_reference_id /
// subscription.metadata.user_id) or we look it up from any existing row that
// already has the same stripe_subscription_id or stripe_customer_id.
async function upsertSubscription(
  sub: Stripe.Subscription,
  opts: { userIdHint?: string | null; statusOverride?: string } = {},
) {
  const plan = planFromSubscription(sub);
  const status = opts.statusOverride ?? sub.status;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;

  const patch: Record<string, unknown> = {
    stripe_customer_id: customerId,
    status,
    current_period_start: toIso(sub.current_period_start),
    current_period_end: toIso(sub.current_period_end),
  };
  if (plan) patch.plan = plan;

  // 1) Try update-by-subscription-id first; this is the common case once the
  //    initial row exists, and it preserves the user_id we already wrote.
  const updated = await updateByStripeSubId(sub.id, patch);
  if (updated) {
    console.log('[stripe-webhook] updated row for sub', sub.id, 'status=', status);
    return;
  }

  // 2) No row yet -> we need a user_id to satisfy the NOT NULL constraint.
  //    Sources, in order of trust:
  //      a) opts.userIdHint (e.g. checkout.session.client_reference_id)
  //      b) subscription.metadata.user_id (we set this in create-checkout-session)
  //      c) any existing row with the same stripe_customer_id
  let userId =
    opts.userIdHint ||
    (sub.metadata?.user_id as string | undefined) ||
    null;

  if (!userId && customerId) {
    const { data: byCustomer } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .limit(1)
      .maybeSingle();
    if (byCustomer?.user_id) userId = byCustomer.user_id;
  }

  if (!userId) {
    // We cannot insert without user_id. Skip and rely on the next event
    // (typically checkout.session.completed) to seed the row.
    console.warn(
      '[stripe-webhook] no user_id available for sub',
      sub.id,
      '- deferring insert until checkout.session.completed',
    );
    return;
  }

  if (!plan) {
    console.warn('[stripe-webhook] no plan interval on sub', sub.id, '- defaulting to monthly');
  }

  const { error: insertError } = await supabaseAdmin.from('subscriptions').insert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status,
    plan: plan ?? 'monthly',
    current_period_start: toIso(sub.current_period_start),
    current_period_end: toIso(sub.current_period_end),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error('[stripe-webhook] insert error', insertError);
    throw insertError;
  }
  console.log('[stripe-webhook] inserted row for sub', sub.id, 'user', userId, 'status=', status);
}

async function markSubscriptionStatusById(subscriptionId: string, status: string) {
  const updated = await updateByStripeSubId(subscriptionId, { status });
  if (!updated) {
    console.warn('[stripe-webhook] markStatus: no row for', subscriptionId, '(skipping)');
    return;
  }
  console.log('[stripe-webhook] set status=', status, 'for', subscriptionId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return new Response(
      JSON.stringify({
        error:
          'Webhook not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET as edge function secrets.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[stripe-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return new Response(JSON.stringify({ error: 'Database not configured on server.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Use the RAW body for signature verification (do not parse JSON first).
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] signature verification failed:', message);
    return new Response(
      JSON.stringify({ error: `Webhook signature failed: ${message}` }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  console.log('[stripe-webhook] event', event.id, event.type);

  try {
    switch (event.type) {
      // Fires as soon as a Checkout Session is paid. This is our canonical
      // place to seed the subscriptions row because it carries the
      // client_reference_id we set in create-checkout-session (= user_id).
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode !== 'subscription') {
          console.log('[stripe-webhook] non-subscription checkout, ignoring', session.id);
          break;
        }

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        const userId =
          (session.client_reference_id as string | null) ||
          (session.metadata?.user_id as string | undefined) ||
          null;

        if (!subscriptionId) {
          console.warn('[stripe-webhook] checkout.session.completed without subscription id');
          break;
        }
        if (!userId) {
          console.warn(
            '[stripe-webhook] checkout.session.completed missing client_reference_id; cannot link user',
          );
        }

        // Re-fetch the subscription to get authoritative period dates / status / interval.
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscription(sub, { userIdHint: userId });
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(sub);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        // Persist the final canceled state so the UI reflects it immediately.
        await upsertSubscription(sub, { statusOverride: 'canceled' });
        break;
      }

      // Defensive: keep period dates / status fresh on renewals & failures even
      // if customer.subscription.updated is delayed.
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await upsertSubscription(sub);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subscriptionId) {
          await markSubscriptionStatusById(subscriptionId, 'past_due');
        }
        break;
      }

      default:
        console.log('[stripe-webhook] ignoring event type', event.type);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] handler error for', event.type, message);
    // Return 500 so Stripe retries with backoff.
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ received: true, type: event.type }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});
