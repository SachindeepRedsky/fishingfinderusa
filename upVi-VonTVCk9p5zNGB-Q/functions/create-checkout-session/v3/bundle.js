// create-checkout-session
// ---------------------------------------------------------------------------
// Creates a Stripe Checkout Session for the FishingFinderUSA Pro subscription
// (monthly or yearly) and returns the hosted-checkout URL.
//
// WALLETS / EXPRESS CHECKOUT:
//   We pass `payment_method_types[]=card` AND
//   `automatic_payment_methods[enabled]=true`. Together these guarantee:
//     - Card payments are always allowed (even in newer accounts that
//       default-disable card via Dashboard settings).
//     - Stripe automatically surfaces Apple Pay / Google Pay / Link as
//       express-checkout buttons on the hosted page when the customer's
//       device + browser supports them. No additional wallet configuration
//       is required because Apple Pay / Google Pay ride on top of card.
//
// SECURITY:
//   - Uses STRIPE_SECRET_KEY (Supabase Edge Function secret).
//
// REQUEST BODY:
//   {
//     plan: 'monthly' | 'yearly',
//     priceId?: string,
//     email?: string,
//     userId?: string,
//     successUrl?: string,
//     cancelUrl?: string,
//     debug?: boolean
//   }
// ---------------------------------------------------------------------------

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

Deno.serve(async (req) => {
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

    const envPriceMonthly = Deno.env.get('STRIPE_PRICE_MONTHLY') ?? '';
    const envPriceYearly = Deno.env.get('STRIPE_PRICE_YEARLY') ?? '';
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

    let priceId = priceIdOverride;
    if (!priceId) {
      if (plan === 'monthly') priceId = envPriceMonthly;
      else if (plan === 'yearly') priceId = envPriceYearly;
    }

    const origin =
      req.headers.get('origin') ??
      req.headers.get('referer')?.replace(/\/$/, '') ??
      '';

    const success =
      successUrl ??
      `${origin}/checkout/success?plan=${encodeURIComponent(
        plan ?? ''
      )}&session_id={CHECKOUT_SESSION_ID}`;
    const cancel = cancelUrl ?? `${origin}/pricing?canceled=1`;

    if (!stripeSecretKey) {
      return json(
        {
          error:
            'STRIPE_SECRET_KEY is not configured. Add it under Supabase → Project Settings → Edge Functions → Secrets to enable checkout.',
          configHelp: {
            requiredSecrets: [
              'STRIPE_SECRET_KEY (sk_test_… or sk_live_…)',
              'STRIPE_PRICE_MONTHLY (optional, can be passed in request body)',
              'STRIPE_PRICE_YEARLY (optional, can be passed in request body)',
              'STRIPE_WEBHOOK_SECRET (required for webhook verification)',
            ],
            docs: 'https://supabase.com/docs/guides/functions/secrets',
          },
        },
        500
      );
    }

    if (!priceId || !priceId.startsWith('price_')) {
      return json(
        {
          error: `Invalid or missing priceId for plan="${plan}". Either pass a priceId in the request body, or configure STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY as edge function secrets.`,
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

    const detectedMode = stripeSecretKey.startsWith('sk_live_')
      ? 'live'
      : stripeSecretKey.startsWith('sk_test_')
      ? 'test'
      : 'unknown';

    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', success);
    params.append('cancel_url', cancel);
    params.append('allow_promotion_codes', 'true');
    params.append('billing_address_collection', 'auto');

    // ----- WALLETS: Apple Pay / Google Pay / Link -----
    // 1. Explicitly allow card so newer Connect accounts that disable card
    //    by default in Dashboard still work.
    // 2. Enable automatic_payment_methods so Stripe surfaces every wallet
    //    the customer's browser/device supports as an express-checkout
    //    button (Apple Pay on Safari/iOS, Google Pay on Chrome/Android,
    //    Link for repeat customers). No domain verification is required
    //    for the Stripe-hosted checkout page — only for embedded Elements.
    params.append('payment_method_types[]', 'card');
    params.append('automatic_payment_methods[enabled]', 'true');
    // Don't redirect away from checkout for wallet flows.
    params.append('automatic_payment_methods[allow_redirects]', 'never');

    if (email) params.append('customer_email', email);
    if (userId) {
      params.append('client_reference_id', userId);
      params.append('metadata[user_id]', userId);
      params.append('subscription_data[metadata][user_id]', userId);
    }
    if (plan) {
      params.append('metadata[plan]', plan);
      params.append('subscription_data[metadata][plan]', plan);
    }

    const stripeResp = await fetch(
      'https://api.stripe.com/v1/checkout/sessions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Stripe-Version': '2024-06-20',
        },
        body: params.toString(),
      }
    );

    const session = await stripeResp.json();

    if (!stripeResp.ok) {
      const message =
        session?.error?.message ||
        session?.error ||
        `Stripe returned ${stripeResp.status}`;
      console.error('[create-checkout-session] Stripe error:', session);
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

    if (!session?.url) {
      return json(
        { error: 'Stripe did not return a checkout session URL.', mode: detectedMode },
        500
      );
    }

    return json({
      url: session.url,
      sessionId: session.id,
      mode: detectedMode,
      plan: plan ?? null,
      priceId,
      walletsEnabled: ['card', 'apple_pay', 'google_pay', 'link'],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[create-checkout-session] Error:', message);
    return json({ error: message }, 500);
  }
});
