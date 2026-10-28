// create-checkout-session
// -----------------------------------------------------------------------------
// Creates a Stripe Checkout Session for FishingFinderUSA Pro subscriptions.
//
// Supports:
// - Monthly subscriptions
// - Yearly subscriptions
// - Apple Pay
// - Google Pay
// - Link
// - Card payments
//
// IMPORTANT:
// Stripe Checkout automatically handles wallets.
// DO NOT use automatic_payment_methods with Checkout Sessions.
//
// Environment Variables Required:
// - STRIPE_SECRET_KEY
// - STRIPE_PRICE_MONTHLY
// - STRIPE_PRICE_YEARLY
// -----------------------------------------------------------------------------

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// -----------------------------------------------------------------------------
// Helper
// -----------------------------------------------------------------------------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  // ---------------------------------------------------------------------------
  // Handle CORS
  // ---------------------------------------------------------------------------

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  try {
    // -------------------------------------------------------------------------
    // Parse Request Body
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Environment Variables
    // -------------------------------------------------------------------------

    const stripeSecretKey =
      Deno.env.get('STRIPE_SECRET_KEY') ?? '';

    const envPriceMonthly =
      Deno.env.get('STRIPE_PRICE_MONTHLY') ?? '';

    const envPriceYearly =
      Deno.env.get('STRIPE_PRICE_YEARLY') ?? '';

    // -------------------------------------------------------------------------
    // Resolve Price ID
    // -------------------------------------------------------------------------

    let priceId = priceIdOverride;

    if (!priceId) {
      if (plan === 'monthly') {
        priceId = envPriceMonthly;
      }

      if (plan === 'yearly') {
        priceId = envPriceYearly;
      }
    }

    // -------------------------------------------------------------------------
    // Detect Origin
    // -------------------------------------------------------------------------

    const origin =
      req.headers.get('origin') ??
      req.headers.get('referer')?.replace(/\/$/, '') ??
      '';

    // -------------------------------------------------------------------------
    // Success / Cancel URLs
    // -------------------------------------------------------------------------

    const success =
      successUrl ??
      `${origin}/checkout/success?plan=${encodeURIComponent(
        plan ?? ''
      )}&session_id={CHECKOUT_SESSION_ID}`;

    const cancel =
      cancelUrl ??
      `${origin}/pricing?canceled=1`;

    // -------------------------------------------------------------------------
    // Validation
    // -------------------------------------------------------------------------

    if (!stripeSecretKey) {
      return json(
        {
          error:
            'Missing STRIPE_SECRET_KEY in Supabase Edge Function secrets.',

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
          error:
            `Invalid or missing Stripe price ID for plan "${plan}".`,

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

    // -------------------------------------------------------------------------
    // Detect Stripe Mode
    // -------------------------------------------------------------------------

    const detectedMode =
      stripeSecretKey.startsWith('sk_live_')
        ? 'live'
        : stripeSecretKey.startsWith('sk_test_')
        ? 'test'
        : 'unknown';

    // -------------------------------------------------------------------------
    // Stripe Checkout Params
    // -------------------------------------------------------------------------

    const params = new URLSearchParams();

    // Subscription Mode
    params.append('mode', 'subscription');

    // Price
    params.append('line_items[0][price]', priceId);

    // Quantity
    params.append('line_items[0][quantity]', '1');

    // Redirect URLs
    params.append('success_url', success);
    params.append('cancel_url', cancel);

    // Optional UX Improvements
    params.append('allow_promotion_codes', 'true');
    params.append('billing_address_collection', 'auto');

    // -------------------------------------------------------------------------
    // Payment Methods
    // -------------------------------------------------------------------------
    // Stripe Checkout automatically handles:
    // - Cards
    // - Apple Pay
    // - Google Pay
    // - Link
    //
    // based on browser/device compatibility.
    // -------------------------------------------------------------------------

    params.append('payment_method_types[]', 'card');

    // -------------------------------------------------------------------------
    // Customer Email
    // -------------------------------------------------------------------------

    if (email) {
      params.append('customer_email', email);
    }

    // -------------------------------------------------------------------------
    // User Metadata
    // -------------------------------------------------------------------------

    if (userId) {
      params.append('client_reference_id', userId);

      params.append('metadata[user_id]', userId);

      params.append(
        'subscription_data[metadata][user_id]',
        userId
      );
    }

    // -------------------------------------------------------------------------
    // Plan Metadata
    // -------------------------------------------------------------------------

    if (plan) {
      params.append('metadata[plan]', plan);

      params.append(
        'subscription_data[metadata][plan]',
        plan
      );
    }

    // -------------------------------------------------------------------------
    // Create Checkout Session
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Stripe Error Handling
    // -------------------------------------------------------------------------

    if (!stripeResp.ok) {
      const message =
        session?.error?.message ||
        session?.error ||
        `Stripe returned status ${stripeResp.status}`;

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

    // -------------------------------------------------------------------------
    // Missing URL
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Success Response
    // -------------------------------------------------------------------------

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
    // -------------------------------------------------------------------------
    // Unexpected Errors
    // -------------------------------------------------------------------------

    const message =
      err instanceof Error
        ? err.message
        : String(err);

    console.error(
      '[create-checkout-session] Unexpected error:',
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