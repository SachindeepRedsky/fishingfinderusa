export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const GATEWAY_BASE = 'https://stripe.gateway.fastrouter.io';

// Two modes:
//   1. action='create-setup-intent' { customerId } -> returns clientSecret for
//      Stripe Elements so the user can enter a new card. Stripe will attach
//      the resulting PaymentMethod to the customer automatically.
//   2. action='set-default' { customerId, paymentMethodId } -> sets the given
//      payment method as the customer's default for invoices.
//   3. action='attach' { customerId, paymentMethodId } -> attaches an existing
//      PaymentMethod id to the customer (e.g. one tokenized client-side via
//      stripe.createPaymentMethod()).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const gatewayApiKey = Deno.env.get('GATEWAY_API_KEY');
    if (!gatewayApiKey) throw new Error('Gateway API key not configured');

    const { action, customerId, paymentMethodId } = await req.json();
    if (!customerId) throw new Error('customerId is required');

    if (action === 'create-setup-intent') {
      const resp = await fetch(`${GATEWAY_BASE}/payments/setup-intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
        body: JSON.stringify({ customer: customerId })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to create setup intent');
      return new Response(
        JSON.stringify({ clientSecret: data.clientSecret, setupIntentId: data.id }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (action === 'set-default') {
      if (!paymentMethodId) throw new Error('paymentMethodId is required');
      const resp = await fetch(`${GATEWAY_BASE}/payments/customers/${customerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
        body: JSON.stringify({
          invoice_settings: { default_payment_method: paymentMethodId }
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to set default payment method');
      return new Response(JSON.stringify({ success: true, defaultPaymentMethodId: paymentMethodId }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (action === 'attach') {
      if (!paymentMethodId) throw new Error('paymentMethodId is required');
      const resp = await fetch(`${GATEWAY_BASE}/payments/payment-methods/${paymentMethodId}/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
        body: JSON.stringify({ customer: customerId })
      });
      const data = await resp.json();
      if (!resp.ok && !/already/i.test(data?.error || '')) {
        throw new Error(data.error || 'Failed to attach payment method');
      }
      return new Response(JSON.stringify({ success: true, paymentMethodId }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    throw new Error('Invalid action. Use: create-setup-intent, set-default, or attach');
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
