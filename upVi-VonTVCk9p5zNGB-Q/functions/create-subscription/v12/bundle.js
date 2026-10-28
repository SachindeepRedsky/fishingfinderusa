export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const MONTHLY_PRICE_ID = 'price_1TS6y1RtiiZxlanqjPRH40DD';
const YEARLY_PRICE_ID = 'price_1TS6zHRtiiZxlanqrloYUE2J';

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
    if (!gatewayApiKey) throw new Error('Gateway API key not configured');

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

    const priceId = priceIdFromBody || (plan === 'yearly' ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID);

    // ---------------------------------------------------------------------
    // INLINE FLOW (no `action` supplied) — used by InlineCardCheckout.
    // Front-end already tokenized the card with Stripe Elements and sends us
    // the resulting `paymentMethodId`. We:
    //   1. find/create customer
    //   2. attach the payment method to the customer
    //   3. set it as the customer's default invoice payment method
    //   4. create the subscription
    //   5. save the FamousPay customer id back to the user's profile
    // ---------------------------------------------------------------------
    if (!action && paymentMethodId && email) {
      const customerId = await findOrCreateCustomer(gatewayApiKey, email, name);

      // Attach the payment method to the customer
      const attachResp = await fetch(`${GATEWAY_BASE}/payments/payment-methods/${paymentMethodId}/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
        body: JSON.stringify({ customer: customerId })
      });
const attachRespText = await attachResp.text();
debugLog('Customer Flow', 'Attach payment method response', {
  status: attachResp.status,
  statusText: attachResp.statusText,
  data: attachRespText
});
      if (!attachResp.ok) {
        const errData = await attachResp.json().catch(() => ({}));
        // If already attached to this customer, ignore; otherwise surface.
        if (!/already/i.test(errData?.error || '')) {
          throw new Error(errData?.error || 'Failed to attach payment method to customer');
        }
      }

      // Set as default payment method on the customer
      await fetch(`${GATEWAY_BASE}/payments/customers/${customerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
        body: JSON.stringify({
          invoice_settings: { default_payment_method: paymentMethodId }
        })
      }).catch(() => {});

      // Create the subscription using this payment method
      const subResp = await fetch(`${GATEWAY_BASE}/payments/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
        body: JSON.stringify({
          customer: customerId,
          items: [{ price: priceId }],
          default_payment_method: paymentMethodId,
          metadata: { user_id: userId || '', plan: plan || 'monthly' }
        })
      });
      const subscription = await subResp.json();
      if (!subResp.ok) throw new Error(subscription.error || 'Failed to create subscription');

      // Persist FamousPay customer id on the profile so the Payment Methods UI
      // can list / manage cards later.
      if (userId) await saveCustomerIdToProfile(userId, customerId);

      // If 3-D Secure is required, surface the client secret so the front-end
      // can call stripe.confirmCardPayment().
      const latestInvoice = subscription.latest_invoice;
      const pi = latestInvoice?.payment_intent;
      const requiresAction = pi?.status === 'requires_action' || pi?.status === 'requires_confirmation';

      return new Response(JSON.stringify({
        subscriptionId: subscription.id,
        status: subscription.status,
        customerId,
        requiresAction,
        clientSecret: requiresAction ? pi?.client_secret : undefined
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // STEP 1: Create customer and SetupIntent to collect payment method
    if (action === 'create-setup-intent') {
      if (!email) throw new Error('Email is required');
      const customerId = await findOrCreateCustomer(gatewayApiKey, email, name);
      if (userId) await saveCustomerIdToProfile(userId, customerId);

      const setupIntentResponse = await fetch(`${GATEWAY_BASE}/payments/setup-intents`, {
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
      if (!existingCustomerId) throw new Error('Customer ID is required');

      const subscriptionResponse = await fetch(`${GATEWAY_BASE}/payments/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
        body: JSON.stringify({
          customer: existingCustomerId,
          items: [{ price: priceId }],
          default_payment_method: paymentMethodId,
          metadata: { user_id: userId || '', plan: plan || 'monthly' }
        })
      });
      const subscription = await subscriptionResponse.json();
      if (!subscriptionResponse.ok) throw new Error(subscription.error || 'Failed to create subscription');

      if (userId) await saveCustomerIdToProfile(userId, existingCustomerId);

      return new Response(JSON.stringify({
        subscriptionId: subscription.id,
        status: subscription.status,
        customerId: existingCustomerId
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // STEP 3: Cancel subscription
    if (action === 'cancel-subscription') {
      const subscriptionId = subIdFromBody;
      if (!subscriptionId) throw new Error('Subscription ID is required');

      const cancelResponse = await fetch(`${GATEWAY_BASE}/payments/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
        body: JSON.stringify({ immediately: false })
      });
      const cancelData = await cancelResponse.json();
      if (!cancelResponse.ok) throw new Error(cancelData.error || 'Failed to cancel subscription');

      return new Response(JSON.stringify({ status: 'canceled', subscriptionId }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Check subscription status
    if (action === 'check-status') {
      if (!existingCustomerId) throw new Error('Customer ID is required');

      const subsResponse = await fetch(
        `${GATEWAY_BASE}/payments/subscriptions?customer=${existingCustomerId}&status=active`,
        { headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey } }
      );
      const subsData = await subsResponse.json();
      const activeSub = subsData.data?.find((s: any) => s.status === 'active' || s.status === 'trialing');

      return new Response(JSON.stringify({
        hasActiveSubscription: !!activeSub,
        subscription: activeSub || null
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    throw new Error('Invalid action. Use: create-setup-intent, activate-subscription, cancel-subscription, or check-status');
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
