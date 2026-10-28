// create-subscription
// -----------------------------------------------------------------------------
// SetupIntent + subscription flow that talks DIRECTLY to the Stripe REST API
// using the project's own STRIPE_SECRET_KEY (the same secret used by
// create-checkout-session). This guarantees that the SetupIntent we hand to
// the browser is on the SAME Stripe account as the publishable key the
// browser uses with Stripe.js.
//
// Two actions:
//   1) action='create-setup-intent' — find/create customer + create a
//      SetupIntent on the user's Stripe account, restricted to card. Returns
//      clientSecret + customerId.
//   2) action='activate-subscription' — after Stripe.js confirms the
//      SetupIntent, the browser sends us back the resulting payment_method.
//      We attach it to the customer, set it as their default, and create
//      the subscription. Because the default payment method is already on
//      file, Stripe attempts to charge the first invoice immediately. If
//      3DS is required, we return the PaymentIntent's client_secret so the
//      browser can finish authentication.
// -----------------------------------------------------------------------------

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type'
};

const STRIPE_API = 'https://api.stripe.com/v1';

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
  const search = await stripeFetch('/customers/search', secret, {
    query: { query: `email:"${email.replace(/"/g, '\\"')}"`, limit: '1' },
  });
  if (search.ok && Array.isArray(search.json.data) && search.json.data.length) {
    return search.json.data[0].id as string;
  }

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

// Extract a usable client_secret + status from a subscription's latest_invoice.
// Handles both the expanded payment_intent shape and the case where Stripe
// returns only a string invoice id.
function extractPI(sub: any): { clientSecret: string | null; piStatus: string | null; invoiceId: string | null } {
  const inv = sub?.latest_invoice;
  const invoiceId = typeof inv === 'string' ? inv : inv?.id ?? null;
  const pi = typeof inv === 'object' ? inv?.payment_intent : null;
  if (pi && typeof pi === 'object') {
    return {
      clientSecret: pi.client_secret ?? null,
      piStatus: pi.status ?? null,
      invoiceId,
    };
  }
  return { clientSecret: null, piStatus: null, invoiceId };
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

    const envPriceMonthly = Deno.env.get('STRIPE_PRICE_MONTHLY') ?? '';
    const envPriceYearly = Deno.env.get('STRIPE_PRICE_YEARLY') ?? '';

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

      // Attach payment method (idempotent)
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

      // Create the subscription.
      // NOTE: We deliberately do NOT pass payment_behavior=default_incomplete.
      // With default_incomplete Stripe creates the subscription but does not
      // auto-pay the first invoice, which leaves status='incomplete' and no
      // PaymentIntent on the invoice — exactly what was happening before.
      // By omitting payment_behavior, Stripe attempts to charge the
      // default_payment_method immediately. If 3DS is required, the invoice's
      // PaymentIntent will be in 'requires_action' and we return its
      // client_secret so the browser can finish authentication.
      const sub = await stripeFetch('/subscriptions', stripeSecretKey, {
        method: 'POST',
        body: {
          customer: existingCustomerId,
          items: [{ price: resolvedPriceId }],
          default_payment_method: paymentMethodId,
          off_session: true,
          payment_settings: {
            save_default_payment_method: 'on_subscription',
            payment_method_types: ['card'],
          },
          metadata: { user_id: userId || '', plan },
          expand: ['latest_invoice.payment_intent'],
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

      let subData = sub.json;
      let { clientSecret, piStatus, invoiceId } = extractPI(subData);

      // Recovery path: if the subscription is still 'incomplete' AND we don't
      // have a PaymentIntent client_secret yet, explicitly try to pay the
      // invoice with the default payment method, then re-expand.
      if (
        subData?.status === 'incomplete' &&
        !clientSecret &&
        invoiceId
      ) {
        console.log(
          '[create-subscription] subscription incomplete with no PI — attempting invoice pay',
          { invoiceId, subId: subData.id }
        );

        const payAttempt = await stripeFetch(
          `/invoices/${encodeURIComponent(invoiceId)}/pay`,
          stripeSecretKey,
          {
            method: 'POST',
            body: {
              payment_method: paymentMethodId,
              off_session: true,
              expand: ['payment_intent'],
            },
          }
        );

        if (!payAttempt.ok) {
          const piId = payAttempt.json?.error?.payment_intent?.id;
          const piCS = payAttempt.json?.error?.payment_intent?.client_secret;
          if (piCS) {
            // Likely requires_action / authentication_required
            clientSecret = piCS;
            piStatus =
              payAttempt.json?.error?.payment_intent?.status || 'requires_action';
          } else {
            return new Response(
              JSON.stringify({
                error:
                  payAttempt.json?.error?.message ||
                  payAttempt.json?.error ||
                  'Failed to pay subscription invoice',
                stripeStatus: payAttempt.status,
                subscriptionId: subData.id,
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
              }
            );
          }
        } else {
          // Re-fetch subscription with expansion to pick up updated state
          const refetch = await stripeFetch(
            `/subscriptions/${encodeURIComponent(subData.id)}`,
            stripeSecretKey,
            {
              query: {
                'expand[]': 'latest_invoice.payment_intent',
              },
            }
          );
          if (refetch.ok) {
            subData = refetch.json;
            const next = extractPI(subData);
            clientSecret = next.clientSecret;
            piStatus = next.piStatus;
            invoiceId = next.invoiceId;
          }
        }
      }

      return new Response(
        JSON.stringify({
          subscriptionId: subData.id,
          status: subData.status, // 'active' | 'trialing' | 'incomplete' | ...
          customerId: existingCustomerId,
          paymentMethodId,
          invoiceId,
          paymentIntentStatus: piStatus,
          clientSecret: clientSecret || null,
          requiresAction:
            piStatus === 'requires_action' ||
            piStatus === 'requires_confirmation',
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
