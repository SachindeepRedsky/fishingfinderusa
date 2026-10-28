// Stripe webhook endpoint — PUBLIC (no Supabase JWT required).
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  DEPLOYMENT FLAG: verify_jwt = false                                     │
// │  PUBLIC ACCESS:    yes (no Authorization header required)                │
// │  AUTHENTICATION:   Stripe-signature header (HMAC) verified inside        │
// └──────────────────────────────────────────────────────────────────────────┘
//
// This endpoint is intentionally exposed publicly so Stripe's servers can POST
// events to it directly. Stripe does NOT send a Supabase
// `Authorization: Bearer <jwt>` header — it sends a `Stripe-Signature` HMAC
// header instead. If Supabase's edge-runtime JWT verification is enabled for
// this function, every incoming Stripe request is rejected with a 401 BEFORE
// our handler runs, and we never get a chance to validate the signature.
//
// Therefore this function MUST be deployed with `verify_jwt = false` (the
// Famous.ai deployment pipeline applies this automatically to functions named
// `*-webhook`). Authenticity of every request is still strictly enforced
// inside this handler via:
//
//     stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET)
//
// which is the canonical, cryptographically-secure way to authenticate Stripe
// webhook traffic. Any request that does not carry a valid Stripe signature
// for our `STRIPE_WEBHOOK_SECRET` is rejected with HTTP 400 below.
//
// All other edge functions in this project (create-subscription,
// create-checkout-session, create-portal-session, list-payment-methods, etc.)
// continue to require a valid Supabase JWT — this public-access exception
// applies ONLY to `stripe-webhook`.
//
// Also logs every received event into `public.stripe_webhook_events` so the
// admin /admin/stripe-setup wizard can show recent webhook activity.

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


const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Event log helpers (best-effort; never throw — must not block webhook ack)
// ---------------------------------------------------------------------------
async function logEventReceived(params: {
  stripe_event_id: string | null;
  event_type: string;
  signature_valid: boolean;
  is_test: boolean;
  payload_summary: Record<string, unknown>;
  error_message?: string | null;
}) {
  try {
    const { error } = await supabaseAdmin.from('stripe_webhook_events').upsert(
      {
        stripe_event_id: params.stripe_event_id,
        event_type: params.event_type,
        signature_valid: params.signature_valid,
        is_test: params.is_test,
        status: params.signature_valid ? 'received' : 'signature_failed',
        error_message: params.error_message ?? null,
        payload_summary: params.payload_summary,
        processed: false,
      },
      { onConflict: 'stripe_event_id', ignoreDuplicates: false },
    );
    if (error) console.warn('[stripe-webhook] failed to log received event', error.message);
  } catch (e) {
    console.warn('[stripe-webhook] log received exception', (e as Error).message);
  }
}

async function logEventProcessed(stripe_event_id: string | null, ok: boolean, errorMessage?: string) {
  if (!stripe_event_id) return;
  try {
    await supabaseAdmin
      .from('stripe_webhook_events')
      .update({
        processed: ok,
        status: ok ? 'processed' : 'processing_failed',
        error_message: errorMessage ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq('stripe_event_id', stripe_event_id);
  } catch (e) {
    console.warn('[stripe-webhook] log processed exception', (e as Error).message);
  }
}

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

  const updated = await updateByStripeSubId(sub.id, patch);
  if (updated) {
    console.log('[stripe-webhook] updated row for sub', sub.id, 'status=', status);
    return;
  }

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
    console.warn(
      '[stripe-webhook] no user_id available for sub',
      sub.id,
      '- deferring insert until checkout.session.completed',
    );
    return;
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

Deno.serve(async(req) => {
  // Public endpoint: respond to CORS preflight without requiring any auth.
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

  // NOTE: we deliberately do NOT inspect req.headers.get('authorization') here.
  // This endpoint is public; the only credential we trust is the
  // `Stripe-Signature` header, validated against STRIPE_WEBHOOK_SECRET below.
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const rawBody = await req.text();

  // Try to parse the body BEFORE verification so that, on a signature failure,
  // we still capture the event_type / id for the admin log. We won't act on the
  // payload unless verification succeeds.
  let parsedPreview: { id?: string; type?: string; livemode?: boolean } = {};
  try {
    const parsed = JSON.parse(rawBody);
    parsedPreview = {
      id: parsed?.id,
      type: parsed?.type,
      livemode: parsed?.livemode,
    };
  } catch {
    // ignore — non-JSON body
  }

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
    await logEventReceived({
      stripe_event_id: parsedPreview.id ?? null,
      event_type: parsedPreview.type ?? 'unknown',
      signature_valid: false,
      is_test: parsedPreview.id?.startsWith('evt_test_') ?? false,
      payload_summary: { livemode: parsedPreview.livemode ?? null },
      error_message: message,
    });
    return new Response(
      JSON.stringify({ error: `Webhook signature failed: ${message}` }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  const isTest =
    event.id.startsWith('evt_test_') ||
    (event.data?.object as { id?: string })?.id?.toString().startsWith('test_') === true ||
    (event.data?.object as { metadata?: Record<string, string> })?.metadata?.synthetic === 'true';

  console.log('[stripe-webhook] event', event.id, event.type, isTest ? '(test)' : '');

  await logEventReceived({
    stripe_event_id: event.id,
    event_type: event.type,
    signature_valid: true,
    is_test: isTest,
    payload_summary: {
      livemode: event.livemode,
      api_version: event.api_version,
      object_id: (event.data?.object as { id?: string })?.id ?? null,
    },
  });

  // Synthetic test events: signature was valid; ack without touching the
  // subscriptions table so we don't pollute real data.
  if (isTest) {
    await logEventProcessed(event.id, true);
    return new Response(
      JSON.stringify({ received: true, type: event.type, test: true }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  try {
    switch (event.type) {
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
        await upsertSubscription(sub, { statusOverride: 'canceled' });
        break;
      }

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
    await logEventProcessed(event.id, false, message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  await logEventProcessed(event.id, true);

  return new Response(JSON.stringify({ received: true, type: event.type }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});

// ---------------------------------------------------------------------------
// Supabase function config (informational marker — read by the deployment
// pipeline so this function is published with public access):
//
//   verify_jwt = false
//   public     = true
//
// The effective setting is controlled by the project's `config.toml` / the
// Supabase dashboard. The Famous.ai deployment pipeline applies these flags
// automatically to functions named `*-webhook`.
// ---------------------------------------------------------------------------
