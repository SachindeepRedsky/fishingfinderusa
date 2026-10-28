// Stripe webhook endpoint
// Listens for subscription lifecycle events and keeps the `subscriptions` table in sync.
//
// Required environment variables (set these as Edge Function secrets):
//   STRIPE_SECRET_KEY       - sk_test_... or sk_live_... (used to look up subscriptions by ID)
//   STRIPE_WEBHOOK_SECRET   - whsec_...    (from https://dashboard.stripe.com/webhooks -> endpoint -> "Signing secret")
//   SUPABASE_URL            - your project URL (auto-provided in most Supabase deployments; set manually if not)
//   SUPABASE_SERVICE_ROLE_KEY - service role key for writing to the subscriptions table
//
// Configure this endpoint in the Stripe Dashboard to POST to:
//   https://<project-ref>.functions.supabase.co/stripe-webhook
// and subscribe to these events:
//   invoice.paid, invoice.payment_failed,
//   customer.subscription.updated, customer.subscription.deleted

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
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

// Use the async crypto provider so signature verification works in Deno/edge runtimes.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function toIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds || typeof unixSeconds !== 'number') return null;
  return new Date(unixSeconds * 1000).toISOString();
}

// Map a Stripe Subscription object to the columns on our `subscriptions` table.
// We also try to detect monthly vs yearly from the first item's recurring interval.
function subscriptionToRow(sub: Stripe.Subscription) {
  const firstItem = sub.items?.data?.[0];
  const interval = firstItem?.price?.recurring?.interval;
  const plan =
    interval === 'year' ? 'yearly' : interval === 'month' ? 'monthly' : null;

  return {
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    status: sub.status, // active, trialing, past_due, canceled, unpaid, incomplete, etc.
    plan,
    current_period_start: toIso(sub.current_period_start),
    current_period_end: toIso(sub.current_period_end),
    updated_at: new Date().toISOString(),
  };
}

// Upsert by stripe_subscription_id. If the row doesn't exist yet (e.g. webhook arrived
// before the checkout-success handler wrote it), this creates a placeholder row; the
// user_id will be filled in later when the app links the subscription to the user.
async function upsertSubscription(sub: Stripe.Subscription) {
  const row = subscriptionToRow(sub);

  // Prefer updating by stripe_subscription_id to avoid clobbering user_id.
  const { data: existing, error: selectError } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle();

  if (selectError) {
    console.error('[stripe-webhook] select error', selectError);
    throw selectError;
  }

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update(row)
      .eq('id', existing.id);
    if (updateError) {
      console.error('[stripe-webhook] update error', updateError);
      throw updateError;
    }
    console.log('[stripe-webhook] updated subscription', sub.id, 'status=', sub.status);
  } else {
    const { error: insertError } = await supabaseAdmin
      .from('subscriptions')
      .insert({ ...row, created_at: new Date().toISOString() });
    if (insertError) {
      console.error('[stripe-webhook] insert error', insertError);
      throw insertError;
    }
    console.log('[stripe-webhook] inserted subscription', sub.id, 'status=', sub.status);
  }
}

async function markSubscriptionStatusById(subscriptionId: string, status: string) {
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', subscriptionId);
  if (error) {
    console.error('[stripe-webhook] status update error', error);
    throw error;
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

  // Fail fast with a clear message if secrets aren't configured.
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET env var');
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
    return new Response(
      JSON.stringify({ error: 'Database not configured on server.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // IMPORTANT: use the raw body text for signature verification.
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
    return new Response(JSON.stringify({ error: `Webhook signature failed: ${message}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  console.log('[stripe-webhook] received event', event.id, event.type);

  try {
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(sub);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        // Stripe sends the final state; persist it so the UI can show "canceled".
        await upsertSubscription({ ...sub, status: 'canceled' } as Stripe.Subscription);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subscriptionId) {
          // Re-fetch the subscription to get up-to-date period dates & status.
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await upsertSubscription(sub);
        } else {
          console.log('[stripe-webhook] invoice.paid had no subscription, skipping');
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
          // Stripe typically also fires subscription.updated with status=past_due,
          // but update defensively here too.
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
    // Return 500 so Stripe retries.
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
