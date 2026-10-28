// create-subscription
// -----------------------------------------------------------------------------
// SetupIntent + subscription flow that talks DIRECTLY to the Stripe REST API
// using the project's own STRIPE_SECRET_KEY (the same secret used by
// create-checkout-session). This guarantees that the SetupIntent we hand to
// the browser is on the SAME Stripe account as the publishable key the
// browser uses with Stripe.js — which is what Stripe checks when it says:
//
//   "The client_secret provided does not match any associated SetupIntent on
//    this account. Ensure the publishable key used belongs to the same
//    account that created the SetupIntent."
//
// Two actions:
//   1) action='create-setup-intent' — find/create customer + create a
//      SetupIntent on the user's Stripe account, restricted to card. Returns
//      clientSecret + customerId.
//   2) action='activate-subscription' — after Stripe.js confirms the
//      SetupIntent, the browser sends us back the resulting
//      payment_method. We attach it to the customer, set it as their default,
//      and create the subscription (expand latest_invoice.payment_intent so
//      the browser can finish 3DS if required).
// -----------------------------------------------------------------------------

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type'
};

const STRIPE_API = 'https://api.stripe.com/v1';

// -----------------------------------------------------------------------------
// Stripe REST helper. Stripe expects form-urlencoded bodies. This helper
// supports nested objects via dotted keys (e.g. invoice_settings.default_*),
// repeated array values, and returns a parsed JSON body + ok flag.
// -----------------------------------------------------------------------------
function encodeForm(obj: Record<string, any>, prefix = ''): string[][] {
  const out: string[][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          out.push(...encodeForm(item, `${key}[${i}]`));
        } else {
          out.push([`${key}[${i}]`, String(item)]);
        }
      });
    } else if (typeof v === 'object') {
      out.push(...encodeForm(v, key));
    } else {
      out.push([key, String(v)]);
    }
  }
  return out;
}

async function stripeFetch(
  path: string,
  secret: string,
  init: { method?: string; body?: Record<string, any>; query?: Record<string, string> } = {}
) {
  const method = init.method || 'GET';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
  };
  let url = `${STRIPE_API}${path}`;
  let body: string | undefined;

  if (init.query) {
    const qs = new URLSearchParams(init.query).toString();
    if (qs) url += `?${qs}`;
  }

  if (init.body && method !== 'GET') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const params = new URLSearchParams();
    for (const [k, v] of encodeForm(init.body)) {
      params.append(k, v);
    }
    body = params.toString();
  }

  const resp = await fetch(url, { method, headers, body });
  const text = await resp.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  return { ok: resp.ok, status: resp.status, json };
}

async function findOrCreateCustomer(
  secret: string,
  email: string,
  name?: string,
  metadata?: Record<string, string>
): Promise<string> {
  // Stripe doesn't have a direct "find by email" GET, but `customers/search`
  // works on all accounts with search enabled. Fall back to list+filter.
  const search = await stripeFetch('/customers/search', secret, {
    query: { query: `email:"${email.replace(/"/g, '\\"')}"`, limit: '1' },
  });
  if (search.ok && Array.isArray(search.json.data) && search.json.data.length) {
    return search.json.data[0].id as string;
  }

  // Fallback if search isn't available (older accounts)
  const list = await stripeFetch('/customers', secret, {
    query: { email, limit: '1' },
  });
  if (list.ok && Array.isArray(list.json.data) && list.json.data.length) {
    return list.json.data[0].id as string;
  }

  const create = await stripeFetch('/customers', secret, {
    method: 'POST',
    body: {
      email,
      name: name || email.split('@')[0],
      ...(metadata ? { metadata } : {}),
    },
  });
  if (!create.ok) {
    throw new Error(
      create.json?.error?.message ||
        create.json?.error ||
        `Failed to create customer (status ${create.status})`
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
    /* non-fatal */
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({
          error:
            'STRIPE_SECRET_KEY is not configured in Supabase edge function secrets.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const envPriceMonthly =
      Deno.env.get('STRIPE_PRICE_MONTHLY') ?? '';
    const envPriceYearly =
      Deno.env.get('STRIPE_PRICE_YEARLY') ?? '';

    const body = await req.json().catch(() => ({}));
    const {
      action = 'create-setup-intent',
      email,
      name,
      plan = 'monthly',
      userId,
      customerId: existingCustomerId,
      paymentMethodId,
      priceId: priceIdOverride,
    } = body || {};

    const resolvedPriceId =
      priceIdOverride ||
      (plan === 'yearly' ? envPriceYearly : envPriceMonthly);

    // -----------------------------------------------------------------------
    // STEP 1: create SetupIntent
    // -----------------------------------------------------------------------
    if (action === 'create-setup-intent') {
      if (!email) throw new Error('email is required');

      const customerId = await findOrCreateCustomer(stripeSecretKey, email, name, {
        ...(userId ? { user_id: userId } : {}),
      });

      const setup = await stripeFetch('/setup_intents', stripeSecretKey, {
        method: 'POST',
        body: {
          customer: customerId,
          // CARD ONLY — no ACH, SEPA, us_bank_account, etc.
          payment_method_types: ['card'],
          usage: 'off_session',
          metadata: {
            plan,
            user_id: userId || '',
            price_id: resolvedPriceId || '',
          },
        },
      });

      if (!setup.ok) {
        return new Response(
          JSON.stringify({
            error:
              setup.json?.error?.message ||
              setup.json?.error ||
              `Failed to create SetupIntent (status ${setup.status})`,
            stripeStatus: setup.status,
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
        );
      }

      if (userId) await saveCustomerIdToProfile(userId, customerId);

      return new Response(
        JSON.stringify({
          clientSecret: setup.json.client_secret,
          setupIntentId: setup.json.id,
          customerId,
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // -----------------------------------------------------------------------
    // STEP 2: activate subscription with the confirmed payment_method
    // -----------------------------------------------------------------------
    if (action === 'activate-subscription') {
      if (!existingCustomerId) throw new Error('customerId is required');
      if (!paymentMethodId) throw new Error('paymentMethodId is required');
      if (!resolvedPriceId || !resolvedPriceId.startsWith('price_')) {
        throw new Error(
          `Invalid or missing price ID for plan "${plan}". Set STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY in edge function secrets.`
        );
      }

      // Attach payment method to customer (idempotent — ignore "already attached")
      const attach = await stripeFetch(
        `/payment_methods/${encodeURIComponent(paymentMethodId)}/attach`,
        stripeSecretKey,
        {
          method: 'POST',
          body: { customer: existingCustomerId },
        }
      );
      if (!attach.ok) {
        const msg = String(
          attach.json?.error?.message || attach.json?.error || ''
        );
        if (!/already been attached|already attached/i.test(msg)) {
          console.warn('[create-subscription] attach warning:', msg.slice(0, 200));
        }
      }

      // Set as default payment method on the customer
      await stripeFetch(
        `/customers/${encodeURIComponent(existingCustomerId)}`,
        stripeSecretKey,
        {
          method: 'POST',
          body: {
            invoice_settings: { default_payment_method: paymentMethodId },
          },
        }
      );

      // Create the subscription
      const sub = await stripeFetch('/subscriptions', stripeSecretKey, {
        method: 'POST',
        body: {
          customer: existingCustomerId,
          items: [{ price: resolvedPriceId }],
          default_payment_method: paymentMethodId,
          payment_behavior: 'default_incomplete',
          payment_settings: {
            save_default_payment_method: 'on_subscription',
            payment_method_types: ['card'],
          },
          metadata: { user_id: userId || '', plan },
          expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
        },
      });

      if (!sub.ok) {
        return new Response(
          JSON.stringify({
            error:
              sub.json?.error?.message ||
              sub.json?.error ||
              `Failed to create subscription (status ${sub.status})`,
            stripeStatus: sub.status,
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
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
          clientSecret: pi?.client_secret || null,
          requiresAction:
            pi?.status === 'requires_action' ||
            pi?.status === 'requires_confirmation',
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
