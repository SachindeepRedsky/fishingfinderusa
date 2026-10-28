// Stripe Customer Portal session creator.
// Looks up the caller's stripe_customer_id from the subscriptions table and
// returns a portal URL the frontend can open in a new tab.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { customerId, returnUrl } = await req.json().catch(() => ({}));

    if (!customerId) {
      return new Response(
        JSON.stringify({ error: 'customerId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Use the Stripe secret key directly here because the Stripe Payment Gateway
    // does not expose a billing portal endpoint. This requires STRIPE_SECRET_KEY
    // to be configured as an Edge Function secret.
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({
          error: 'STRIPE_SECRET_KEY is not configured as a Supabase Edge Function secret.',
          demoMode: true,
          message:
            'Add STRIPE_SECRET_KEY in Supabase → Project Settings → Edge Functions → Secrets, then redeploy.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const finalReturnUrl =
      returnUrl ||
      req.headers.get('origin') + '/pricing' ||
      'https://example.com/pricing';

    // Stripe Billing Portal session creation
    // https://stripe.com/docs/api/customer_portal/sessions/create
    const formBody = new URLSearchParams();
    formBody.append('customer', customerId);
    formBody.append('return_url', finalReturnUrl);

    const stripeRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });

    const data = await stripeRes.json();

    if (!stripeRes.ok) {
      return new Response(
        JSON.stringify({
          error: data?.error?.message || 'Failed to create billing portal session',
          stripeError: data?.error,
        }),
        { status: stripeRes.status, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ url: data.url, id: data.id }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
