export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// =============================================================================
// create-subscription — Two-step gateway flow
// -----------------------------------------------------------------------------
// The FastRouter Stripe gateway does NOT expose POST /payments/payment-methods,
// so we cannot tokenize raw card data server-side. Instead we use the
// SetupIntent flow described in Famous's docs:
//
//   STEP 1 (action: 'create-setup-intent'):
//     - Find or create the customer on the gateway's connected Stripe account.
//     - Create a SetupIntent on the gateway and return its clientSecret.
//     - Frontend confirms the SetupIntent with Stripe.js (PaymentElement),
//       using the SAME publishable key + stripeAccount as the gateway. The
//       payment_method that comes back is therefore valid on the gateway's
//       account.
//
//   STEP 2 (action: 'activate-subscription'):
//     - Frontend POSTs back with the confirmed setupIntent.payment_method.
//     - Server attaches it (if needed), sets it as the customer's default,
//       and creates the subscription on the gateway.
// =============================================================================

const MONTHLY_PRICE_ID = 'price_1TEvlPHfgy5MmDs0r9T2HCOP';
const YEARLY_PRICE_ID = 'price_1TEvlUHfgy5MmDs0ZqUsmnKW';

const GATEWAY_BASE = 'https://stripe.gateway.fastrouter.io';

async function gatewayFetch(
  path: string,
  apiKey: string,
  init: RequestInit = {}
) {
  const resp = await fetch(`${GATEWAY_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      ...(init.headers || {}),
    },
  });
  const raw = await resp.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = { _raw: raw };
  }
  return { ok: resp.ok, status: resp.status, raw, json };
}

async function findOrCreateCustomer(apiKey: string, email: string, name?: string) {
  const list = await gatewayFetch(
    `/payments/customers?email=${encodeURIComponent(email)}`,
    apiKey
  );
  if (list.ok && list.json?.data?.length > 0) return list.json.data[0].id as string;

  const create = await gatewayFetch('/payments/customers', apiKey, {
    method: 'POST',
    body: JSON.stringify({ email, name: name || email.split('@')[0] }),
  });
  if (!create.ok) {
    throw new Error(
      create.json?.error?.message || create.json?.error || 'Failed to create customer'
    );
  }
  return create.json.id as string;
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
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }),
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
    const apiKey = Deno.env.get('GATEWAY_API_KEY');
    if (!apiKey) throw new Error('Missing Gateway API key');

    const body = await req.json();
    const {
      action = 'create-setup-intent',
      email,
      name,
      plan = 'monthly',
      userId,
      customerId: existingCustomerId,
      paymentMethodId,
    } = body;

    // -------------------------------------------------------------------
    // STEP 1: create SetupIntent for collecting a card via Stripe Elements
    // -------------------------------------------------------------------
    if (action === 'create-setup-intent') {
      if (!email) throw new Error('email is required');

      const customerId = await findOrCreateCustomer(apiKey, email, name);

      const setup = await gatewayFetch('/payments/setup-intents', apiKey, {
        method: 'POST',
        body: JSON.stringify({
          customer: customerId,
          metadata: {
            plan,
            user_id: userId || '',
            price_id: plan === 'yearly' ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID,
          },
        }),
      });

      if (!setup.ok) {
        throw new Error(
          setup.json?.error?.message ||
            setup.json?.error ||
            'Failed to create setup intent'
        );
      }

      if (userId) await saveCustomerIdToProfile(userId, customerId);

      return new Response(
        JSON.stringify({
          clientSecret: setup.json.clientSecret || setup.json.client_secret,
          setupIntentId: setup.json.id,
          customerId,
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // -------------------------------------------------------------------
    // STEP 2: create subscription using confirmed setupIntent.payment_method
    // -------------------------------------------------------------------
    if (action === 'activate-subscription') {
      if (!existingCustomerId) throw new Error('customerId is required');
      if (!paymentMethodId) throw new Error('paymentMethodId is required');

      const priceId = plan === 'yearly' ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID;

      // Attach payment method (idempotent — ignore "already attached")
      const attach = await gatewayFetch('/payments/payment-methods/attach', apiKey, {
        method: 'POST',
        body: JSON.stringify({
          customer: existingCustomerId,
          payment_method: paymentMethodId,
        }),
      });
      if (!attach.ok) {
        const msg = String(
          attach.json?.error?.message || attach.json?.error || attach.raw || ''
        );
        if (!/already been attached|already attached/i.test(msg)) {
          // Not fatal — confirmed SetupIntents auto-attach in many cases.
          // We log but continue.
          console.warn('attach payment method warning:', msg.slice(0, 200));
        }
      }

      // Set as default payment method on the customer
      await gatewayFetch(`/payments/customers/${existingCustomerId}`, apiKey, {
        method: 'POST',
        body: JSON.stringify({
          invoice_settings: { default_payment_method: paymentMethodId },
        }),
      });

      // Create the subscription
      const sub = await gatewayFetch('/payments/subscriptions', apiKey, {
        method: 'POST',
        body: JSON.stringify({
          customer: existingCustomerId,
          items: [{ price: priceId }],
          default_payment_method: paymentMethodId,
          metadata: { user_id: userId || '', plan },
          expand: ['latest_invoice.payment_intent'],
        }),
      });

      if (!sub.ok) {
        throw new Error(
          sub.json?.error?.message ||
            sub.json?.error ||
            'Failed to create subscription'
        );
      }

      if (userId) await saveCustomerIdToProfile(userId, existingCustomerId);

      const pi = sub.json?.latest_invoice?.payment_intent;
      return new Response(
        JSON.stringify({
          subscriptionId: sub.json.id,
          status: sub.json.status,
          customerId: existingCustomerId,
          paymentMethodId,
          clientSecret: pi?.client_secret,
          requiresAction: pi?.status === 'requires_action',
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message || String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});
