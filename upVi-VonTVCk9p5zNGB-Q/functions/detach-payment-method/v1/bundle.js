export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const GATEWAY_BASE = 'https://stripe.gateway.fastrouter.io';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const gatewayApiKey = Deno.env.get('GATEWAY_API_KEY');
    if (!gatewayApiKey) throw new Error('Gateway API key not configured');

    const { paymentMethodId } = await req.json();
    if (!paymentMethodId) throw new Error('paymentMethodId is required');

    const resp = await fetch(`${GATEWAY_BASE}/payments/payment-methods/${paymentMethodId}/detach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey }
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to detach payment method');

    return new Response(JSON.stringify({ success: true, paymentMethodId }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
