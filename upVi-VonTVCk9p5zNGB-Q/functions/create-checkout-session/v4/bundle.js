// create-checkout-session
// ---------------------------------------------------------------------------
// Creates a Stripe Checkout Session for the FishingFinderUSA Pro subscription
// (monthly or yearly) and returns the hosted-checkout URL.
//
// NOTES:
// - Stripe Checkout automatically supports:
//   • Cards
//   • Apple Pay
//   • Google Pay
//   • Link
//
// - DO NOT use automatic_payment_methods with Checkout Sessions.
//   That parameter only works with PaymentIntents / SetupIntents.
//
// - Wallets appear automatically when:
//   • enabled in Stripe Dashboard
//   • browser/device supports them
//   • currency/region supports them
//
// SECURITY:
// - Uses STRIPE_SECRET_KEY from Supabase Edge Function secrets.
//
// REQUEST BODY:
// {
//   plan: 'monthly' | 'yearly',
//   priceId?: string,
//   email?: string,
//   userId?: string,
//   successUrl?: string,
//   cancelUrl?: string,
//   debug?: boolean
// }
// ---------------------------------------------------------------------------

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const {
      plan,
      priceId: priceIdOverride,
      email,
      userId,
      successUrl,
      cancelUrl,
      debug,
    }: {
      plan?: 'monthly' | 'yearly';
      priceId?: string;
      email?: string;
      userId?: string;
      successUrl?: string;
      cancelUrl?: string;
      debug?: boolean;
    } = body ?? {};

    // -----------------------------------------------------------------------
    // Environment variables
    // -----------------------------------------------------------------------

    const envPriceMonthly =
      Deno.env.get('STRIPE_PRICE_MONTHLY') ?? '';

    const envPriceYearly =
      Deno.env.get('STRIPE_PRICE_YEARLY') ?? '';

    const stripeSecretKey =
      Deno.env.get('STRIPE_SECRET_KEY') ?? '';

    // -----------------------------------------------------------------------
    // Resolve price ID
    // -----------------------------------------------------------------------

    let priceId = priceIdOverride;

    if (!priceId) {
      if (plan === 'monthly') {
        priceId = envPriceMonthly;
      } else if (plan === 'yearly') {
        priceId = envPriceYearly;
      }
    }

    // -----------------------------------------------------------------------
    // Origin URLs
    // -----------------------------------------------------------------------

    const origin =
      req.headers.get('origin') ??
      req.headers.get('referer')?.replace(/\/$/, '') ??
      '';

    const success =
      successUrl ??
      `${origin}/checkout/success?plan=${encodeURIComponent(
        plan ?? ''
      )}&session_id={CHECKOUT_SESSION_ID}`;

    const cancel =
      cancelUrl ??
      `${origin}/pricing?canceled=1`;

    // -----------------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------------

    if (!stripeSecretKey) {
      return json(
        {
          error:
            'STRIPE_SECRET_KEY is not configured.',

          configHelp: {
            requiredSecrets: [
              'STRIPE_SECRET_KEY',
              'STRIPE_PRICE_MONTHLY',
              'STRIPE_PRICE_YEARLY',
              'STRIPE_WEBHOOK_SECRET',
            ],

            docs:
              'https://supabase.com/docs/guides/functions/secrets',
          },
        },
        500
      );
    }

    if (!priceId || !priceId.startsWith('price_')) {
      return json(
        {
          error: `Invalid or missing priceId for plan="${plan}"`,

          diagnostics: debug
            ? {
                receivedPlan: plan,
                receivedPriceId: priceIdOverride,
                resolvedPriceId: priceId,
                hasMonthlyEnv: !!envPriceMonthly,
                hasYearlyEnv: !!envPriceYearly,
              }
            : undefined,
        },
        400
      );
    }

    // -----------------------------------------------------------------------
    // Detect mode
    // -----------------------------------------------------------------------

    const detectedMode = stripeSecretKey.startsWith('sk_live_')
      ? 'live'
      : stripeSecretKey.startsWith('sk_test_')
      ? 'test'
      : 'unknown';

    // -----------------------------------------------------------------------
    // Build Stripe Checkout params
    // -----------------------------------------------------------------------

    const params = new URLSearchParams();

    params.append('mode', 'subscription');

    params.append('line_items[0][price]', priceId);

    params.append('line_items[0][quantity]', '1');

    params.append('success_url', success);

    params.append('cancel_url', cancel);

    params.append('allow_promotion_codes', 'true');

    params.append('billing_address_collection', 'auto');

    // Optional:
    // Explicitly allow card payments.
    // Apple Pay / Google Pay / Link automatically appear when supported.
    params.append('payment_method_types[]', 'card');

    // -----------------------------------------------------------------------
    // Customer info
    // -----------------------------------------------------------------------

    if (email) {
      params.append('customer_email', email);
    }

    if (userId) {
      params.append('client_reference_id', userId);

      params.append('metadata[user_id]', userId);

      params.append(
        'subscription_data[metadata][user_id]',
        userId
      );
    }

    if (plan) {
      params.append('metadata[plan]', plan);

      params.append(
        'subscription_data[metadata][plan]',
        plan
      );
    }

    // -----------------------------------------------------------------------
    // Create Stripe Checkout Session
    // -----------------------------------------------------------------------

    const stripeResp = await fetch(
      'https://api.stripe.com/v1/checkout/sessions',
      {
        method: 'POST',

        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type':
            'application/x-www-form-urlencoded',
        },

        body: params.toString(),
      }
    );

    const session = await stripeResp.json();

    // -----------------------------------------------------------------------
    // Stripe errors
    // -----------------------------------------------------------------------

    if (!stripeResp.ok) {
      const message =
        session?.error?.message ||
        session?.error ||
        `Stripe returned ${stripeResp.status}`;

      console.error(
        '[create-checkout-session] Stripe error:',
        session
      );

      return json(
        {
          error: message,
          stripeStatus: stripeResp.status,
          stripeError: session?.error,
          mode: detectedMode,
        },
        400
      );
    }

    // -----------------------------------------------------------------------
    // Missing URL
    // -----------------------------------------------------------------------

    if (!session?.url) {
      return json(
        {
          error:
            'Stripe did not return a checkout session URL.',
          mode: detectedMode,
        },
        500
      );
    }

    // -----------------------------------------------------------------------
    // Success
    // -----------------------------------------------------------------------

    return json({
      url: session.url,
      sessionId: session.id,
      mode: detectedMode,
      plan: plan ?? null,
      priceId,

      walletsEnabled: [
        'card',
        'apple_pay',
        'google_pay',
        'link',
      ],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);

    console.error(
      '[create-checkout-session] Error:',
      message
    );

    return json(
      {
        error: message,
      },
      500
    );
  }
});