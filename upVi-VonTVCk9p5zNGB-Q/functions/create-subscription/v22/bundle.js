export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const MONTHLY_PRICE_ID = 'price_1TEvlPHfgy5MmDs0r9T2HCOP';
const YEARLY_PRICE_ID = 'price_1TEvlUHfgy5MmDs0ZqUsmnKW';

const GATEWAY_BASE = 'https://stripe.gateway.fastrouter.io';

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

async function createPaymentMethodOnGateway(
  gatewayApiKey: string,
  card: { number: string; exp_month: number; exp_year: number; cvc: string },
  billing: { name?: string; email?: string; postal_code?: string }
) {
  // Try several common payload shapes the gateway might accept. Stripe's REST
  // API itself uses form-encoded data, while many gateways accept JSON shaped
  // like the Stripe SDK.
  const jsonBody = {
    type: 'card',
    card,
    billing_details: {
      name: billing.name,
      email: billing.email,
      address: billing.postal_code ? { postal_code: billing.postal_code } : undefined,
    },
  };

  let resp = await fetch(`${GATEWAY_BASE}/payments/payment-methods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
    body: JSON.stringify(jsonBody),
  });

  let raw = await resp.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { data = { _raw: raw }; }

  if (!resp.ok) {
    // Fallback: try form-encoded (Stripe-style) — flatten card.* fields
    const form = new URLSearchParams();
    form.set('type', 'card');
    form.set('card[number]', card.number);
    form.set('card[exp_month]', String(card.exp_month));
    form.set('card[exp_year]', String(card.exp_year));
    form.set('card[cvc]', card.cvc);
    if (billing.name) form.set('billing_details[name]', billing.name);
    if (billing.email) form.set('billing_details[email]', billing.email);
    if (billing.postal_code) form.set('billing_details[address][postal_code]', billing.postal_code);

    resp = await fetch(`${GATEWAY_BASE}/payments/payment-methods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-API-Key': gatewayApiKey,
      },
      body: form.toString(),
    });
    raw = await resp.text();
    try { data = JSON.parse(raw); } catch { data = { _raw: raw }; }
    if (!resp.ok) {
      throw new Error(
        (data && (data.error?.message || data.error || data.message)) ||
        `Failed to create payment method (status ${resp.status}): ${raw.slice(0, 300)}`
      );
    }
  }

  const pmId = data?.id || data?.payment_method?.id;
  if (!pmId) throw new Error('Gateway did not return a payment method id: ' + JSON.stringify(data).slice(0, 300));
  return pmId as string;
}

async function saveCustomerIdToProfile(userId: string, customerId: string) {
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
      plan,
      paymentMethodId: incomingPmId,
      card, // { number, exp_month, exp_year, cvc, postal_code }
      userId,
    } = body;

    const priceId = plan === 'yearly' ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID;

    if (!email) throw new Error('email is required');

    // 1) Get/create the customer on the gateway
    const customerId = await findOrCreateCustomer(gatewayApiKey, email, name);

    // 2) Get a gateway payment method id. Either use one supplied by the
    //    client (already attached) OR create a new one from raw card data
    //    sent by the front-end.
    let paymentMethodId = incomingPmId;
    if (!paymentMethodId) {
      if (!card || !card.number || !card.exp_month || !card.exp_year || !card.cvc) {
        throw new Error('card details are required');
      }
      paymentMethodId = await createPaymentMethodOnGateway(
        gatewayApiKey,
        {
          number: String(card.number).replace(/\s+/g, ''),
          exp_month: Number(card.exp_month),
          exp_year: Number(card.exp_year),
          cvc: String(card.cvc),
        },
        { name, email, postal_code: card.postal_code }
      );
    }

    // 3) Attach the payment method to the customer (idempotent on gateway)
    const attachResp = await fetch(`${GATEWAY_BASE}/payments/payment-methods/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
      body: JSON.stringify({ customer: customerId, payment_method: paymentMethodId }),
    });
    const attachRaw = await attachResp.text();
    if (!attachResp.ok) {
      // If already attached, the gateway may return an error we can ignore
      let attachErr: any;
      try { attachErr = JSON.parse(attachRaw); } catch { attachErr = { error: attachRaw }; }
      const msg = String(attachErr?.error?.message || attachErr?.error || attachErr?.message || '');
      if (!/already been attached/i.test(msg)) {
        throw new Error('Failed to attach payment method: ' + msg.slice(0, 300));
      }
    }

    // 4) Set as default payment method on the customer
    await fetch(`${GATEWAY_BASE}/payments/customers/${customerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
      body: JSON.stringify({
        invoice_settings: { default_payment_method: paymentMethodId },
      }),
    });

    // 5) Create the subscription
    const subResp = await fetch(`${GATEWAY_BASE}/payments/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
      body: JSON.stringify({
        customer: customerId,
        items: [{ price: priceId }],
        default_payment_method: paymentMethodId,
        metadata: { user_id: userId || '', plan: plan || 'monthly' },
        expand: ['latest_invoice.payment_intent'],
      }),
    });

    const raw = await subResp.text();
    let subscription: any;
    try { subscription = JSON.parse(raw); } catch {
      throw new Error('Gateway did not return JSON: ' + raw.slice(0, 300));
    }
    if (!subResp.ok) {
      throw new Error(
        subscription?.error?.message || subscription?.error || 'Subscription failed'
      );
    }

    if (userId) {
      await saveCustomerIdToProfile(userId, customerId);
    }

    const pi = subscription?.latest_invoice?.payment_intent;
    return new Response(JSON.stringify({
      subscriptionId: subscription.id,
      status: subscription.status,
      customerId,
      paymentMethodId,
      clientSecret: pi?.client_secret,
      requiresAction: pi?.status === 'requires_action',
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message || String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
