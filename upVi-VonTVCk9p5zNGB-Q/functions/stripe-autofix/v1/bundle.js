// stripe-autofix: detects common Stripe misconfigurations and offers one-click fixes.
//
// Actions (POST body { action: "..." }):
//   - "detect": scan Stripe account + env, return list of issues with fixable=true/false
//   - "fix-webhook": create/update a webhook endpoint with the required events
//   - "sync-prices": list active recurring prices and suggest correct IDs for monthly/yearly

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REQUIRED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
];

interface Issue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  fixable: boolean;
  fixAction?: 'fix-webhook' | 'sync-prices' | 'manual';
  manualSteps?: string[];
  data?: Record<string, unknown>;
}

async function stripeFetch(path: string, init?: RequestInit) {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(init?.headers || {}),
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message || `Stripe API error (HTTP ${res.status})`);
  }
  return body;
}

function backendMode(): 'test' | 'live' | 'unknown' {
  const key = Deno.env.get('STRIPE_SECRET_KEY') || '';
  if (key.startsWith('sk_live_')) return 'live';
  if (key.startsWith('sk_test_')) return 'test';
  return 'unknown';
}

async function detectIssues(req: Request): Promise<Issue[]> {
  const issues: Issue[] = [];
  const url = new URL(req.url);
  const body = req.method === 'POST' ? await req.clone().json().catch(() => ({})) : {};
  const frontendMode: string | undefined = body.frontendMode;
  const monthlyPriceId: string | undefined = body.monthlyPriceId;
  const yearlyPriceId: string | undefined = body.yearlyPriceId;
  const expectedWebhookUrl: string | undefined = body.webhookUrl;

  const beMode = backendMode();

  // 1. Mode mismatch
  if (frontendMode && frontendMode !== 'unknown' && beMode !== 'unknown' && frontendMode !== beMode) {
    issues.push({
      id: 'mode-mismatch',
      severity: 'error',
      title: `Mode mismatch: frontend is ${frontendMode.toUpperCase()}, backend is ${beMode.toUpperCase()}`,
      description:
        'Stripe will reject every transaction until both frontend and backend use the same mode (test OR live).',
      fixable: false,
      fixAction: 'manual',
      manualSteps: [
        `Decide which mode you want: ${beMode.toUpperCase()} or ${frontendMode.toUpperCase()}`,
        'In Stripe Dashboard, copy the matching pk_ and sk_ keys (toggle test/live switch top-right)',
        'Update VITE_STRIPE_PUBLISHABLE_KEY in .env (frontend)',
        'Update STRIPE_SECRET_KEY in Famous Edge Function Secrets (backend)',
        'Re-run diagnostic to confirm both report the same mode',
      ],
      data: { frontendMode, backendMode: beMode },
    });
  }

  if (beMode === 'unknown') {
    // Can't talk to Stripe — return early
    return issues;
  }

  // 2. Webhook endpoint check
  try {
    const endpoints = await stripeFetch('/webhook_endpoints?limit=100');
    const list: any[] = endpoints.data || [];

    if (list.length === 0) {
      issues.push({
        id: 'webhook-missing',
        severity: 'error',
        title: 'No webhook endpoint configured in Stripe',
        description:
          'Without a webhook, your app will never know when subscriptions are created, renewed, cancelled, or fail. Click Auto-fix to create one pointing at your stripe-webhook edge function.',
        fixable: true,
        fixAction: 'fix-webhook',
        data: { existingCount: 0 },
      });
    } else {
      // Find the endpoint that points at our edge function (best effort: contains "stripe-webhook")
      const ours = list.find((e) => typeof e.url === 'string' && e.url.includes('stripe-webhook'));
      if (!ours) {
        issues.push({
          id: 'webhook-no-match',
          severity: 'warning',
          title: 'No webhook endpoint matches this project',
          description: `Found ${list.length} webhook(s) in Stripe but none point at a stripe-webhook URL. Click Auto-fix to create one.`,
          fixable: true,
          fixAction: 'fix-webhook',
          data: { existingUrls: list.map((e) => e.url) },
        });
      } else {
        const enabled: string[] = ours.enabled_events || [];
        const isWildcard = enabled.includes('*');
        const missing = isWildcard
          ? []
          : REQUIRED_WEBHOOK_EVENTS.filter((evt) => !enabled.includes(evt));
        if (missing.length > 0) {
          issues.push({
            id: 'webhook-missing-events',
            severity: 'warning',
            title: `Webhook is missing ${missing.length} required event(s)`,
            description: `Your webhook at ${ours.url} subscribes to ${enabled.length} event(s) but is missing: ${missing.join(', ')}. Click Auto-fix to add them.`,
            fixable: true,
            fixAction: 'fix-webhook',
            data: { endpointId: ours.id, missing, currentEvents: enabled, url: ours.url },
          });
        }
        if (ours.status === 'disabled') {
          issues.push({
            id: 'webhook-disabled',
            severity: 'error',
            title: 'Webhook endpoint is disabled in Stripe',
            description:
              'Stripe disables webhooks that fail repeatedly. Re-enable it in the Stripe dashboard or click Auto-fix to recreate it.',
            fixable: true,
            fixAction: 'fix-webhook',
            data: { endpointId: ours.id, url: ours.url },
          });
        }
      }
    }
  } catch (err) {
    issues.push({
      id: 'webhook-list-failed',
      severity: 'error',
      title: 'Could not list webhook endpoints',
      description: (err as Error).message,
      fixable: false,
      fixAction: 'manual',
    });
  }

  // 3. Price recurring interval check
  for (const [label, priceId, expectedInterval] of [
    ['Monthly', monthlyPriceId, 'month'] as const,
    ['Yearly', yearlyPriceId, 'year'] as const,
  ]) {
    if (!priceId || !priceId.startsWith('price_')) continue;
    try {
      const price: any = await stripeFetch(`/prices/${priceId}`);
      if (!price.recurring) {
        issues.push({
          id: `price-not-recurring-${label.toLowerCase()}`,
          severity: 'error',
          title: `${label} price (${priceId}) is a one-time price, not a subscription`,
          description: `Subscriptions require a recurring price. Click Sync prices to find a recurring price with interval=${expectedInterval}.`,
          fixable: true,
          fixAction: 'sync-prices',
          data: { priceId, label },
        });
      } else if (price.recurring.interval !== expectedInterval) {
        issues.push({
          id: `price-wrong-interval-${label.toLowerCase()}`,
          severity: 'error',
          title: `${label} price has wrong interval`,
          description: `${priceId} bills every ${price.recurring.interval_count} ${price.recurring.interval}, but ${label.toLowerCase()} should be every 1 ${expectedInterval}. Click Sync prices to find the right one.`,
          fixable: true,
          fixAction: 'sync-prices',
          data: { priceId, actual: price.recurring, expectedInterval, label },
        });
      } else if (!price.active) {
        issues.push({
          id: `price-inactive-${label.toLowerCase()}`,
          severity: 'warning',
          title: `${label} price (${priceId}) is archived/inactive`,
          description: `Stripe will reject checkouts using inactive prices. Reactivate it in the dashboard or pick a different price.`,
          fixable: true,
          fixAction: 'sync-prices',
          data: { priceId, label },
        });
      }
    } catch (err) {
      issues.push({
        id: `price-fetch-failed-${label.toLowerCase()}`,
        severity: 'error',
        title: `${label} price (${priceId}) does not exist in this Stripe account`,
        description: `Stripe returned: ${(err as Error).message}. The price ID may be from a different account or mode.`,
        fixable: true,
        fixAction: 'sync-prices',
        data: { priceId, label },
      });
    }
  }

  return issues;
}

async function fixWebhook(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => ({}));
  const url: string | undefined = body.webhookUrl;
  if (!url) throw new Error('webhookUrl is required (the public URL of the stripe-webhook edge function)');

  // Find existing webhook with this URL
  const list = await stripeFetch('/webhook_endpoints?limit=100');
  const existing = (list.data || []).find((e: any) => e.url === url || (typeof e.url === 'string' && e.url.includes('stripe-webhook')));

  const params = new URLSearchParams();
  REQUIRED_WEBHOOK_EVENTS.forEach((evt) => params.append('enabled_events[]', evt));

  if (existing) {
    // Update events list
    params.set('disabled', 'false');
    const updated = await stripeFetch(`/webhook_endpoints/${existing.id}`, {
      method: 'POST',
      body: params.toString(),
    });
    return {
      action: 'updated',
      endpointId: updated.id,
      url: updated.url,
      events: updated.enabled_events,
      message: `Updated webhook ${updated.id} with ${REQUIRED_WEBHOOK_EVENTS.length} events.`,
      secret: updated.secret || null, // only present on freshly created endpoints
    };
  }

  // Create new endpoint
  params.set('url', url);
  params.set('description', 'Auto-created by Famous Stripe Setup wizard');
  const created = await stripeFetch('/webhook_endpoints', {
    method: 'POST',
    body: params.toString(),
  });
  return {
    action: 'created',
    endpointId: created.id,
    url: created.url,
    events: created.enabled_events,
    secret: created.secret, // ONLY available at creation — copy this to STRIPE_WEBHOOK_SECRET
    message: `Created webhook ${created.id}. IMPORTANT: copy the signing secret below into STRIPE_WEBHOOK_SECRET (it will not be shown again).`,
  };
}

async function syncPrices(): Promise<Record<string, unknown>> {
  const prices = await stripeFetch('/prices?limit=100&active=true&expand[]=data.product');
  const recurring = (prices.data || []).filter((p: any) => p.recurring);

  const monthly = recurring.filter((p: any) => p.recurring.interval === 'month' && p.recurring.interval_count === 1);
  const yearly = recurring.filter((p: any) => p.recurring.interval === 'year' && p.recurring.interval_count === 1);

  const summarize = (p: any) => ({
    id: p.id,
    nickname: p.nickname,
    productName: p.product?.name || p.product,
    amount: (p.unit_amount || 0) / 100,
    currency: p.currency,
    active: p.active,
  });

  return {
    monthly: monthly.map(summarize),
    yearly: yearly.map(summarize),
    suggested: {
      monthly: monthly[0]?.id || null,
      yearly: yearly[0]?.id || null,
    },
    envSnippet:
      monthly[0] && yearly[0]
        ? `VITE_STRIPE_PRICE_MONTHLY=${monthly[0].id}\nVITE_STRIPE_PRICE_YEARLY=${yearly[0].id}`
        : null,
    message: `Found ${monthly.length} monthly and ${yearly.length} yearly recurring price(s).`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = req.method === 'POST' ? await req.clone().json().catch(() => ({})) : {};
    const action = body.action || 'detect';

    let result: unknown;
    if (action === 'detect') {
      result = { issues: await detectIssues(req), backendMode: backendMode() };
    } else if (action === 'fix-webhook') {
      result = await fixWebhook(req);
    } else if (action === 'sync-prices') {
      result = await syncPrices();
    } else {
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
