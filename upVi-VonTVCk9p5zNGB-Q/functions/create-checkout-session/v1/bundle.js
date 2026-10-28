// create-checkout-session
// ---------------------------------------------------------------------------
// Creates a Stripe Checkout Session for the FishingFinderUSA Pro subscription
// (monthly or yearly) and returns the hosted-checkout URL.
//
// SECURITY:
//   - Uses STRIPE_SECRET_KEY which MUST be configured as a Supabase Edge
//     Function secret (project settings → Edge Functions → Secrets). Never
//     committed to the repo, never sent to the browser.
//   - The frontend only ever receives the session URL it should redirect to.
//
// REQUEST BODY:
//   {
//     plan: 'monthly' | 'yearly',
//     priceId?: string,      // optional override; otherwise read from env
//     email?: string,        // pre-fill checkout with the customer's email
//     userId?: string,       // stored in metadata for webhook reconciliation
//     successUrl?: string,   // optional override for return URL on success
//     cancelUrl?: string     // optional override for return URL on cancel
//   }
//
// RESPONSE:
//   { url: string, sessionId: string }    on success
//   { error: string }                     on failure (with non-200 status)
// ---------------------------------------------------------------------------

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is not configured. Add it as a Supabase Edge Function secret.'
      );
    }

    // Optional: price IDs can be configured server-side as secrets so the
    // frontend doesn't need to know them. Falls back to request body.
    const envPriceMonthly = Deno.env.get('STRIPE_PRICE_MONTHLY') ?? '';
    const envPriceYearly = Deno.env.get('STRIPE_PRICE_YEARLY') ?? '';

    const body = await req.json().catch(() => ({}));
    const {
      plan,
      priceId: priceIdOverride,
      email,
      userId,
      successUrl,
      cancelUrl,
    }: {
      plan?: 'monthly' | 'yearly';
      priceId?: string;
      email?: string;
      userId?: string;
      successUrl?: string;
      cancelUrl?: string;
    } = body ?? {};

    // Resolve which Stripe price ID to use
    let priceId = priceIdOverride;
    if (!priceId) {
      if (plan === 'monthly') priceId = envPriceMonthly;
      else if (plan === 'yearly') priceId = envPriceYearly;
    }

    if (!priceId || !priceId.startsWith('price_')) {
      throw new Error(
        `Invalid or missing priceId for plan="${plan}". Either pass a priceId in the request body, or configure STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY as edge function secrets.`
      );
    }

    // Default return URLs — derived from the request's Origin header so this
    // works in dev (localhost) and production without code changes.
    const origin =
      req.headers.get('origin') ??
      req.headers.get('referer')?.replace(/\/$/, '') ??
      '';

    const success =
      successUrl ??
      `${origin}/checkout/success?plan=${encodeURIComponent(plan ?? '')}&session_id={CHECKOUT_SESSION_ID}`;
    const cancel = cancelUrl ?? `${origin}/pricing?canceled=1`;

    // Build the application/x-www-form-urlencoded payload Stripe expects.
    // Using URLSearchParams keeps us SDK-free (no esm.sh/npm import which is
    // explicitly disallowed for edge functions).
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', success);
    params.append('cancel_url', cancel);
    params.append('allow_promotion_codes', 'true');
    params.append('billing_address_collection', 'auto');

    if (email) {
      params.append('customer_email', email);
    }
    if (userId) {
      params.append('client_reference_id', userId);
      params.append('metadata[user_id]', userId);
      params.append('subscription_data[metadata][user_id]', userId);
    }
    if (plan) {
      params.append('metadata[plan]', plan);
      params.append('subscription_data[metadata][plan]', plan);
    }

    const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2024-06-20',
      },
      body: params.toString(),
    });

    const session = await stripeResp.json();

    if (!stripeResp.ok) {
      const message =
        session?.error?.message ||
        session?.error ||
        `Stripe returned ${stripeResp.status}`;
      console.error('[create-checkout-session] Stripe error:', session);
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!session?.url) {
      throw new Error('Stripe did not return a checkout session URL.');
    }

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[create-checkout-session] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
