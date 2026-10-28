// create-checkout-session
// ---------------------------------------------------------------------------
// Creates a Stripe Checkout Session for the FishingFinderUSA Pro subscription
// (monthly or yearly) and returns the hosted-checkout URL.
//
// SECURITY:
//   - Uses STRIPE_SECRET_KEY which should be configured as a Supabase Edge
//     Function secret (project settings → Edge Functions → Secrets).
//   - When STRIPE_SECRET_KEY is NOT configured, the function returns a 200
//     response with `demoMode: true` and a synthetic session payload so the
//     debug panel and end-to-end UI flow can still be verified without real
//     credentials. The frontend should detect `demoMode` and surface a clear
//     "configure STRIPE_SECRET_KEY for real checkout" message rather than
//     redirecting to the placeholder URL.
//
// REQUEST BODY:
//   {
//     plan: 'monthly' | 'yearly',
//     priceId?: string,      // optional override; otherwise read from env
//     email?: string,        // pre-fill checkout with the customer's email
//     userId?: string,       // stored in metadata for webhook reconciliation
//     successUrl?: string,
//     cancelUrl?: string,
//     debug?: boolean        // when true, response includes diagnostic info
//   }
//
// RESPONSE (success):
//   { url, sessionId, mode: 'live'|'test'|'demo', demoMode?: boolean, ... }
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

    // Resolve which Stripe price ID to use
    let priceId = priceIdOverride;
    if (!priceId) {
      if (plan === 'monthly') priceId = envPriceMonthly;
      else if (plan === 'yearly') priceId = envPriceYearly;
    }

    // Default return URLs derived from request Origin
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

    // ---------------------------------------------------------------
    // DEMO MODE: STRIPE_SECRET_KEY not configured.
    // Return a synthetic 200 response so admins/debug panel can verify
    // the request/response wiring without having configured the secret.
    // ---------------------------------------------------------------
    if (!stripeSecretKey) {
      const fakeSessionId = `cs_demo_${crypto.randomUUID().replace(/-/g, '')}`;
      console.warn(
        '[create-checkout-session] STRIPE_SECRET_KEY not configured — returning demo response.'
      );
      return json({
        demoMode: true,
        mode: 'demo',
        sessionId: fakeSessionId,
        url: `${origin}/checkout/success?plan=${encodeURIComponent(
          plan ?? ''
        )}&session_id=${fakeSessionId}&demo=1`,
        plan: plan ?? null,
        priceId: priceId ?? null,
        message:
          'Demo mode: STRIPE_SECRET_KEY is not configured as a Supabase Edge Function secret. Add it under Supabase → Project Settings → Edge Functions → Secrets to enable real Stripe checkout.',
        configHelp: {
          requiredSecrets: [
            'STRIPE_SECRET_KEY (required, sk_test_… or sk_live_…)',
            'STRIPE_PRICE_MONTHLY (optional, can be passed in request body)',
            'STRIPE_PRICE_YEARLY (optional, can be passed in request body)',
            'STRIPE_WEBHOOK_SECRET (required for webhook verification)',
          ],
          docs:
            'https://supabase.com/docs/guides/functions/secrets',
        },
        diagnostics: debug
          ? {
              receivedPlan: plan,
              receivedPriceId: priceIdOverride,
              resolvedPriceId: priceId,
              hasMonthlyEnv: !!envPriceMonthly,
              hasYearlyEnv: !!envPriceYearly,
              origin,
              successUrl: success,
              cancelUrl: cancel,
            }
          : undefined,
      });
    }

    // ---------------------------------------------------------------
    // REAL STRIPE CALL — secret key is present.
    // ---------------------------------------------------------------
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[create-checkout-session] Error:', message);
    return json({ error: message }, 500);
  }
});
