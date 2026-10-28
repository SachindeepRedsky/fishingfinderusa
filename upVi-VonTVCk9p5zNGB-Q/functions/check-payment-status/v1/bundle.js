import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(
  Deno.env.get('STRIPE_SECRET_KEY') || '',
  {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  }
);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();

    const sessionId = body?.sessionId;

    if (!sessionId) {
      return json(
        {
          error: 'sessionId required',
        },
        400
      );
    }

    // Fetch checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      {
        expand: ['subscription'],
      }
    );

    // Payment not completed yet
    if (session.payment_status !== 'paid') {
      return json({
        success: true,
        paid: false,
        status: session.payment_status,
      });
    }

    // Subscription
    const subscription =
      typeof session.subscription === 'object'
        ? session.subscription
        : null;

    if (!subscription) {
      return json({
        error: 'No subscription found',
      });
    }

    const userId =
      session.client_reference_id ||
      session.metadata?.user_id;

    if (!userId) {
      return json({
        error: 'No userId found',
      });
    }

    // Check existing subscription
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();

    // Already inserted
    if (existing) {
      return json({
        success: true,
        paid: true,
        alreadyExists: true,
      });
    }

    // Detect plan
    const interval =
      subscription.items.data?.[0]?.price?.recurring
        ?.interval;

    const plan =
      interval === 'year'
        ? 'yearly'
        : 'monthly';

    // Insert subscription
    const { error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        stripe_customer_id:
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id,

        stripe_subscription_id: subscription.id,

        status: subscription.status,

        plan,

        current_period_start: new Date(
          subscription.current_period_start * 1000
        ).toISOString(),

        current_period_end: new Date(
          subscription.current_period_end * 1000
        ).toISOString(),
      });

    if (error) {
      return json({
        error: error.message,
      });
    }

    return json({
      success: true,
      paid: true,
    });
  } catch (err) {
    return json(
      {
        error:
          err instanceof Error
            ? err.message
            : String(err),
      },
      500
    );
  }
});