
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const MONTHLY_PRICE_ID = 'price_1TEvlPHfgy5MmDs0r9T2HCOP';
const YEARLY_PRICE_ID = 'price_1TEvlUHfgy5MmDs0ZqUsmnKW';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const gatewayApiKey = Deno.env.get("GATEWAY_API_KEY");
    if (!gatewayApiKey) throw new Error("Gateway API key not configured");

    const { email, name, action, customerId: existingCustomerId, plan } = await req.json();
    const priceId = plan === 'yearly' ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID;

    // STEP 1: Create customer and SetupIntent to collect payment method
    if (action === 'create-setup-intent') {
      if (!email) throw new Error("Email is required");

      // Check if customer exists
      const customersResponse = await fetch(`https://stripe.gateway.fastrouter.io/payments/customers?email=${encodeURIComponent(email)}`, {
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey }
      });
      const customersData = await customersResponse.json();

      let customerId;
      if (customersData.data?.length > 0) {
        customerId = customersData.data[0].id;
      } else {
        // Create new customer
        const createCustomerResponse = await fetch('https://stripe.gateway.fastrouter.io/payments/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
          body: JSON.stringify({ email, name: name || email.split('@')[0] })
        });
        const newCustomer = await createCustomerResponse.json();
        if (!createCustomerResponse.ok) throw new Error(newCustomer.error || 'Failed to create customer');
        customerId = newCustomer.id;
      }

      // Create SetupIntent to collect payment method
      const setupIntentResponse = await fetch('https://stripe.gateway.fastrouter.io/payments/setup-intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
        body: JSON.stringify({ customer: customerId, metadata: { price_id: priceId, plan: plan || 'monthly' } })
      });
      const setupIntent = await setupIntentResponse.json();
      if (!setupIntentResponse.ok) throw new Error(setupIntent.error || 'Failed to create setup intent');

      return new Response(JSON.stringify({
        clientSecret: setupIntent.clientSecret,
        customerId,
        setupIntentId: setupIntent.id
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // STEP 2: Create subscription after payment method is saved
    if (action === 'activate-subscription') {
      if (!existingCustomerId) throw new Error("Customer ID is required");

      const subscriptionResponse = await fetch('https://stripe.gateway.fastrouter.io/payments/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
        body: JSON.stringify({
          customer: existingCustomerId,
          items: [{ price: priceId }]
        })
      });
      const subscription = await subscriptionResponse.json();
      if (!subscriptionResponse.ok) throw new Error(subscription.error || 'Failed to create subscription');

      return new Response(JSON.stringify({
        subscriptionId: subscription.id,
        status: subscription.status,
        customerId: existingCustomerId
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // STEP 3: Cancel subscription
    if (action === 'cancel-subscription') {
      const { subscriptionId } = await req.json();
      if (!subscriptionId) throw new Error("Subscription ID is required");

      const cancelResponse = await fetch(`https://stripe.gateway.fastrouter.io/payments/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
        body: JSON.stringify({ immediately: false })
      });
      const cancelData = await cancelResponse.json();
      if (!cancelResponse.ok) throw new Error(cancelData.error || 'Failed to cancel subscription');

      return new Response(JSON.stringify({
        status: 'canceled',
        subscriptionId
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Check subscription status
    if (action === 'check-status') {
      if (!existingCustomerId) throw new Error("Customer ID is required");

      const subsResponse = await fetch(`https://stripe.gateway.fastrouter.io/payments/subscriptions?customer=${existingCustomerId}&status=active`, {
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey }
      });
      const subsData = await subsResponse.json();

      const activeSub = subsData.data?.find((s: any) => s.status === 'active' || s.status === 'trialing');

      return new Response(JSON.stringify({
        hasActiveSubscription: !!activeSub,
        subscription: activeSub || null
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    throw new Error("Invalid action. Use: create-setup-intent, activate-subscription, cancel-subscription, or check-status");
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
