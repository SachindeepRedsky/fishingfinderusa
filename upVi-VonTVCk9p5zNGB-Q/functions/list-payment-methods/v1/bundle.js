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

    const { customerId } = await req.json();
    if (!customerId) throw new Error('customerId is required');

    // Fetch payment methods of type=card for this customer
    const pmResp = await fetch(
      `${GATEWAY_BASE}/payments/payment-methods?customer=${encodeURIComponent(customerId)}&type=card`,
      { headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey } }
    );
    const pmData = await pmResp.json();
    if (!pmResp.ok) throw new Error(pmData.error || 'Failed to list payment methods');

    // Fetch the customer to know which payment method is the default
    const custResp = await fetch(`${GATEWAY_BASE}/payments/customers/${encodeURIComponent(customerId)}`, {
      headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey }
    });
    const customer = await custResp.json();
    const defaultPmId =
      customer?.invoice_settings?.default_payment_method ||
      customer?.default_source ||
      null;

    const methods = (pmData.data || []).map((pm: any) => ({
      id: pm.id,
      brand: pm.card?.brand || 'card',
      last4: pm.card?.last4 || '••••',
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      funding: pm.card?.funding,
      country: pm.card?.country,
      billingName: pm.billing_details?.name || null,
      isDefault: pm.id === defaultPmId,
      created: pm.created
    }));

    return new Response(JSON.stringify({ paymentMethods: methods, defaultPaymentMethodId: defaultPmId }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
