export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const MONTHLY_PRICE_ID = 'price_1TEvlPHfgy5MmDs0r9T2HCOP';
const YEARLY_PRICE_ID = 'price_1TEvlUHfgy5MmDs0ZqUsmnKW';

const GATEWAY_BASE = 'https://stripe.gateway.fastrouter.io';

function debugLog(section: string, message: string, data?: any) {
  const logMessage = `[DEBUG - ${section}] ${message} ${data ? JSON.stringify(data) : ''}`;
  
  // We use console.warn or console.error because Famous.ai logs errors!
  console.warn(logMessage); 
}

async function findOrCreateCustomer(gatewayApiKey: string, email: string, name?: string) {
  const customersResponse = await fetch(
    `${GATEWAY_BASE}/payments/customers?email=${encodeURIComponent(email)}`,
    { headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey } }
  );
  const customersData = await customersResponse.json();
  if (customersData.data?.length > 0) return customersData.data[0].id as string;

  const createResp = await fetch(`${GATEWAY_BASE}/payments/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
    body: JSON.stringify({ email, name: name || email.split('@')[0] })
  });
  const newCustomer = await createResp.json();
  if (!createResp.ok) throw new Error(newCustomer.error || 'Failed to create customer');
  return newCustomer.id as string;
}

async function saveCustomerIdToProfile(userId: string, customerId: string) {
  // Best-effort: write the FamousPay customer id back to the user's profile so
  // the front-end can list / manage saved cards later. Uses the service-role
  // pattern via the Supabase REST endpoint exposed to edge functions.
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey || !userId) return;
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
    });
  } catch (_e) {
    // non-fatal
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const gatewayApiKey = Deno.env.get('GATEWAY_API_KEY');
    if (!gatewayApiKey) throw new Error('Missing Gateway API key');

    const body = await req.json();

    const {
      email,
      name,
      action,
      customerId: existingCustomerId,
      plan,
      paymentMethodId,
      userId,
      priceId: priceIdFromBody,
      subscriptionId: subIdFromBody
    } = body;

    const priceId = plan === 'yearly'
      ? YEARLY_PRICE_ID
      : MONTHLY_PRICE_ID;

    // ----------------------------
    // INLINE SUBSCRIPTION FLOW
    // ----------------------------
    if (!action && paymentMethodId && email) {

      const customerId = await findOrCreateCustomer(
        gatewayApiKey,
        email,
        name
      );

      await fetch(`${GATEWAY_BASE}/payments/payment-methods/attach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': gatewayApiKey,
        },
        body: JSON.stringify({
          customer: customerId,
          payment_method: paymentMethodId,
        }),
      });

      await fetch(`${GATEWAY_BASE}/payments/customers/${customerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': gatewayApiKey,
        },
        body: JSON.stringify({
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        }),
      });

      const subResp = await fetch(`${GATEWAY_BASE}/payments/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': gatewayApiKey,
        },
        body: JSON.stringify({
          customer: customerId,
          items: [{ price: priceId }],
          default_payment_method: paymentMethodId,
          metadata: {
            user_id: userId || '',
            plan: plan || 'monthly',
          },
        }),
      });

      const contentType = subResp.headers.get("content-type") || "";
      const raw = await subResp.text();

      let subscription: any;
      try {
        subscription = JSON.parse(raw);
      } catch {
        throw new Error(
          "Gateway did not return JSON. It returned:\n" + raw.slice(0, 200)
        );
      }

      if (!subResp.ok) {
        throw new Error(subscription.error || "Subscription failed");
      }

      if (userId) {
        await saveCustomerIdToProfile(userId, customerId);
      }

      return new Response(JSON.stringify({
        subscriptionId: subscription.id,
        status: subscription.status,
        customerId,
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    throw new Error('Invalid request flow');

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
