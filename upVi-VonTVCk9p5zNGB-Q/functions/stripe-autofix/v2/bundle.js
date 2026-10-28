// stripe-autofix: detects common Stripe misconfigurations and offers one-click fixes.
//
// Actions (POST body { action: "..." }):
//   - "detect": scan Stripe account + env, return list of issues with fixable=true/false
//   - "fix-webhook": create/update a webhook endpoint with the required events
//   - "sync-prices": list active recurring prices and suggest correct IDs for monthly/yearly
//   - "compare-modes": list products + prices in BOTH test and live mode side-by-side
//   - "clone-prices": clone missing prices from source mode into target mode (matched by product name)

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
  fixAction?: 'fix-webhook' | 'sync-prices' | 'clone-prices' | 'manual';
  manualSteps?: string[];
  data?: Record<string, unknown>;
}

function modeFromKey(key: string | undefined | null): 'test' | 'live' | 'unknown' {
  if (!key) return 'unknown';
  if (key.startsWith('sk_live_')) return 'live';
  if (key.startsWith('sk_test_')) return 'test';
  return 'unknown';
}

function backendMode(): 'test' | 'live' | 'unknown' {
  return modeFromKey(Deno.env.get('STRIPE_SECRET_KEY'));
}

// Resolve a Stripe secret key for the requested mode.
// Priority:
//   1. Explicit per-mode env var (STRIPE_SECRET_KEY_TEST / STRIPE_SECRET_KEY_LIVE)
//   2. The default STRIPE_SECRET_KEY if it matches the requested mode
//   3. An overrideKey passed in the request body (for one-shot comparisons)
function resolveKeyForMode(
  mode: 'test' | 'live',
  overrideKey?: string | null,
): { key: string | null; source: string } {
  const perMode =
    mode === 'test'
      ? Deno.env.get('STRIPE_SECRET_KEY_TEST')
      : Deno.env.get('STRIPE_SECRET_KEY_LIVE');
  if (perMode && modeFromKey(perMode) === mode) {
    return { key: perMode, source: `env STRIPE_SECRET_KEY_${mode.toUpperCase()}` };
  }
  const def = Deno.env.get('STRIPE_SECRET_KEY');
  if (def && modeFromKey(def) === mode) {
    return { key: def, source: 'env STRIPE_SECRET_KEY' };
  }
  if (overrideKey && modeFromKey(overrideKey) === mode) {
    return { key: overrideKey, source: 'request body override' };
  }
  return { key: null, source: '' };
}

async function stripeFetch(path: string, init?: RequestInit, keyOverride?: string | null) {
  const key = keyOverride ?? Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('Stripe secret key not available');
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

async function detectIssues(req: Request): Promise<Issue[]> {
  const issues: Issue[] = [];
  const body = req.method === 'POST' ? await req.clone().json().catch(() => ({})) : {};
  const frontendMode: string | undefined = body.frontendMode;
  const monthlyPriceId: string | undefined = body.monthlyPriceId;
  const yearlyPriceId: string | undefined = body.yearlyPriceId;

  const beMode = backendMode();

  // 1. Mode mismatch — now offers clone-prices as a fix path
  if (frontendMode && frontendMode !== 'unknown' && beMode !== 'unknown' && frontendMode !== beMode) {
    // Check if the "other mode" key is also available — if so, we can clone automatically
    const otherMode = beMode === 'test' ? 'live' : 'test';
    const otherKey = resolveKeyForMode(otherMode);
    const canClone = !!otherKey.key;

    issues.push({
      id: 'mode-mismatch',
      severity: 'error',
      title: `Mode mismatch: frontend is ${frontendMode.toUpperCase()}, backend is ${beMode.toUpperCase()}`,
      description: canClone
        ? 'Stripe will reject every transaction until both sides use the same mode. Use the "Compare modes & clone prices" panel below to migrate products/prices to your chosen target mode in one click.'
        : 'Stripe will reject every transaction until both sides use the same mode. To enable one-click cloning between modes, also add STRIPE_SECRET_KEY_TEST and STRIPE_SECRET_KEY_LIVE to Edge Function Secrets.',
      fixable: canClone,
      fixAction: canClone ? 'clone-prices' : 'manual',
      manualSteps: canClone
        ? undefined
        : [
            `Decide which mode you want: ${beMode.toUpperCase()} or ${frontendMode.toUpperCase()}`,
            'In Stripe Dashboard, copy the matching pk_ and sk_ keys (toggle test/live switch top-right)',
            'Update VITE_STRIPE_PUBLISHABLE_KEY in .env (frontend)',
            'Update STRIPE_SECRET_KEY in Famous Edge Function Secrets (backend)',
            'OPTIONAL: also set STRIPE_SECRET_KEY_TEST and STRIPE_SECRET_KEY_LIVE for one-click mode cloning',
            'Re-run diagnostic to confirm both report the same mode',
          ],
      data: { frontendMode, backendMode: beMode, canClone, otherModeKeyAvailable: canClone },
    });
  }

  if (beMode === 'unknown') {
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

  const list = await stripeFetch('/webhook_endpoints?limit=100');
  const existing = (list.data || []).find((e: any) => e.url === url || (typeof e.url === 'string' && e.url.includes('stripe-webhook')));

  const params = new URLSearchParams();
  REQUIRED_WEBHOOK_EVENTS.forEach((evt) => params.append('enabled_events[]', evt));

  if (existing) {
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
      secret: updated.secret || null,
    };
  }

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
    secret: created.secret,
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

// ---- New: side-by-side mode comparison + cloning ----

interface SimplePrice {
  id: string;
  nickname: string | null;
  unit_amount: number | null;
  currency: string;
  active: boolean;
  recurring: { interval: string; interval_count: number } | null;
  product_id: string;
}

interface SimpleProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  prices: SimplePrice[];
}

async function loadCatalog(key: string): Promise<SimpleProduct[]> {
  // Fetch up to 100 products and 100 prices, then group prices by product
  const [productsResp, pricesResp] = await Promise.all([
    stripeFetch('/products?limit=100&active=true', undefined, key),
    stripeFetch('/prices?limit=100&active=true', undefined, key),
  ]);

  const products: SimpleProduct[] = (productsResp.data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    active: p.active,
    prices: [],
  }));

  for (const price of pricesResp.data || []) {
    const productId = typeof price.product === 'string' ? price.product : price.product?.id;
    const product = products.find((p) => p.id === productId);
    if (!product) continue;
    product.prices.push({
      id: price.id,
      nickname: price.nickname,
      unit_amount: price.unit_amount,
      currency: price.currency,
      active: price.active,
      recurring: price.recurring
        ? { interval: price.recurring.interval, interval_count: price.recurring.interval_count }
        : null,
      product_id: productId,
    });
  }

  return products;
}

// Build a stable signature for a price so we can match equivalents across modes
// Format: amount-currency-interval-intervalCount  (or amount-currency-onetime)
function priceSignature(price: SimplePrice): string {
  const base = `${price.unit_amount ?? 'null'}-${price.currency}`;
  if (!price.recurring) return `${base}-onetime`;
  return `${base}-${price.recurring.interval}-${price.recurring.interval_count}`;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

interface MatchedProduct {
  name: string;
  test: SimpleProduct | null;
  live: SimpleProduct | null;
  // For each price signature: which side has it, which side is missing
  priceComparison: Array<{
    signature: string;
    label: string; // human-readable e.g. "$9.99/month USD"
    test: SimplePrice | null;
    live: SimplePrice | null;
    missingIn: 'test' | 'live' | null;
  }>;
}

function describePrice(p: SimplePrice): string {
  const amount = p.unit_amount != null ? `$${(p.unit_amount / 100).toFixed(2)}` : 'free';
  const cur = p.currency.toUpperCase();
  if (p.recurring) {
    const every = p.recurring.interval_count === 1
      ? `/${p.recurring.interval}`
      : `every ${p.recurring.interval_count} ${p.recurring.interval}s`;
    return `${amount}${every} ${cur}`;
  }
  return `${amount} ${cur} (one-time)`;
}

async function compareModes(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => ({}));
  const overrideTest: string | undefined = body.testSecretKey;
  const overrideLive: string | undefined = body.liveSecretKey;

  const testKey = resolveKeyForMode('test', overrideTest);
  const liveKey = resolveKeyForMode('live', overrideLive);

  if (!testKey.key && !liveKey.key) {
    throw new Error('No Stripe keys available. Set STRIPE_SECRET_KEY_TEST and/or STRIPE_SECRET_KEY_LIVE in Edge Function Secrets.');
  }

  const [testCatalog, liveCatalog] = await Promise.all([
    testKey.key ? loadCatalog(testKey.key) : Promise.resolve([] as SimpleProduct[]),
    liveKey.key ? loadCatalog(liveKey.key) : Promise.resolve([] as SimpleProduct[]),
  ]);

  // Match products by normalized name
  const allNames = new Set<string>();
  testCatalog.forEach((p) => allNames.add(normalizeName(p.name)));
  liveCatalog.forEach((p) => allNames.add(normalizeName(p.name)));

  const matched: MatchedProduct[] = [];
  for (const name of allNames) {
    const test = testCatalog.find((p) => normalizeName(p.name) === name) || null;
    const live = liveCatalog.find((p) => normalizeName(p.name) === name) || null;
    const displayName = test?.name || live?.name || name;

    // Collect all price signatures across both sides
    const sigs = new Map<string, { signature: string; label: string; test: SimplePrice | null; live: SimplePrice | null }>();
    for (const p of test?.prices || []) {
      const sig = priceSignature(p);
      sigs.set(sig, { signature: sig, label: describePrice(p), test: p, live: null });
    }
    for (const p of live?.prices || []) {
      const sig = priceSignature(p);
      const existing = sigs.get(sig);
      if (existing) {
        existing.live = p;
      } else {
        sigs.set(sig, { signature: sig, label: describePrice(p), test: null, live: p });
      }
    }

    const priceComparison = Array.from(sigs.values()).map((entry) => ({
      ...entry,
      missingIn:
        entry.test && !entry.live
          ? ('live' as const)
          : entry.live && !entry.test
          ? ('test' as const)
          : null,
    }));

    matched.push({ name: displayName, test, live, priceComparison });
  }

  // Sort: items with mismatches first, then alphabetical
  matched.sort((a, b) => {
    const aMissing = a.priceComparison.filter((c) => c.missingIn).length;
    const bMissing = b.priceComparison.filter((c) => c.missingIn).length;
    if (aMissing !== bMissing) return bMissing - aMissing;
    return a.name.localeCompare(b.name);
  });

  return {
    testAvailable: !!testKey.key,
    liveAvailable: !!liveKey.key,
    testKeySource: testKey.source,
    liveKeySource: liveKey.source,
    testProductCount: testCatalog.length,
    liveProductCount: liveCatalog.length,
    matched,
    summary: {
      missingInTest: matched.reduce(
        (sum, m) => sum + m.priceComparison.filter((c) => c.missingIn === 'test').length,
        0,
      ),
      missingInLive: matched.reduce(
        (sum, m) => sum + m.priceComparison.filter((c) => c.missingIn === 'live').length,
        0,
      ),
      productsOnlyInTest: matched.filter((m) => m.test && !m.live).length,
      productsOnlyInLive: matched.filter((m) => !m.test && m.live).length,
    },
  };
}

async function clonePrices(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => ({}));
  const targetMode: 'test' | 'live' = body.targetMode;
  const overrideTest: string | undefined = body.testSecretKey;
  const overrideLive: string | undefined = body.liveSecretKey;

  if (targetMode !== 'test' && targetMode !== 'live') {
    throw new Error('targetMode must be "test" or "live"');
  }
  const sourceMode = targetMode === 'test' ? 'live' : 'test';

  const targetKey = resolveKeyForMode(targetMode, targetMode === 'test' ? overrideTest : overrideLive);
  const sourceKey = resolveKeyForMode(sourceMode, sourceMode === 'test' ? overrideTest : overrideLive);

  if (!targetKey.key) throw new Error(`No ${targetMode.toUpperCase()} mode secret key available.`);
  if (!sourceKey.key) throw new Error(`No ${sourceMode.toUpperCase()} mode secret key available to clone from.`);

  // Load both catalogs
  const [sourceCatalog, targetCatalog] = await Promise.all([
    loadCatalog(sourceKey.key),
    loadCatalog(targetKey.key),
  ]);

  const created: Array<{
    productName: string;
    sourcePriceId: string;
    targetPriceId: string;
    targetProductId: string;
    description: string;
    productAction: 'reused' | 'created';
  }> = [];
  const skipped: Array<{ productName: string; sourcePriceId: string; reason: string }> = [];
  const errors: Array<{ productName: string; sourcePriceId: string; error: string }> = [];

  for (const sourceProduct of sourceCatalog) {
    // Find matching product in target by normalized name
    let targetProduct = targetCatalog.find(
      (p) => normalizeName(p.name) === normalizeName(sourceProduct.name),
    );
    let productAction: 'reused' | 'created' = 'reused';

    // If not found, create it
    if (!targetProduct) {
      try {
        const params = new URLSearchParams();
        params.set('name', sourceProduct.name);
        if (sourceProduct.description) params.set('description', sourceProduct.description);
        params.set('metadata[cloned_from]', sourceProduct.id);
        params.set('metadata[cloned_from_mode]', sourceMode);
        const newProduct = await stripeFetch('/products', {
          method: 'POST',
          body: params.toString(),
        }, targetKey.key);
        targetProduct = {
          id: newProduct.id,
          name: newProduct.name,
          description: newProduct.description,
          active: newProduct.active,
          prices: [],
        };
        productAction = 'created';
      } catch (err) {
        errors.push({
          productName: sourceProduct.name,
          sourcePriceId: '(product-create)',
          error: (err as Error).message,
        });
        continue;
      }
    }

    // Clone any source prices that don't have a matching target price
    for (const sourcePrice of sourceProduct.prices) {
      const sourceSig = priceSignature(sourcePrice);
      const alreadyExists = targetProduct.prices.some((p) => priceSignature(p) === sourceSig);
      if (alreadyExists) {
        skipped.push({
          productName: sourceProduct.name,
          sourcePriceId: sourcePrice.id,
          reason: 'Equivalent price already exists in target mode',
        });
        continue;
      }

      try {
        const params = new URLSearchParams();
        params.set('product', targetProduct.id);
        if (sourcePrice.unit_amount != null) {
          params.set('unit_amount', String(sourcePrice.unit_amount));
        }
        params.set('currency', sourcePrice.currency);
        if (sourcePrice.nickname) params.set('nickname', sourcePrice.nickname);
        if (sourcePrice.recurring) {
          params.set('recurring[interval]', sourcePrice.recurring.interval);
          params.set('recurring[interval_count]', String(sourcePrice.recurring.interval_count));
        }
        params.set('metadata[cloned_from]', sourcePrice.id);
        params.set('metadata[cloned_from_mode]', sourceMode);

        const newPrice = await stripeFetch('/prices', {
          method: 'POST',
          body: params.toString(),
        }, targetKey.key);

        // Add to target catalog so subsequent iterations see it
        targetProduct.prices.push({
          id: newPrice.id,
          nickname: newPrice.nickname,
          unit_amount: newPrice.unit_amount,
          currency: newPrice.currency,
          active: newPrice.active,
          recurring: newPrice.recurring
            ? { interval: newPrice.recurring.interval, interval_count: newPrice.recurring.interval_count }
            : null,
          product_id: targetProduct.id,
        });

        created.push({
          productName: sourceProduct.name,
          sourcePriceId: sourcePrice.id,
          targetPriceId: newPrice.id,
          targetProductId: targetProduct.id,
          description: describePrice(sourcePrice),
          productAction,
        });
      } catch (err) {
        errors.push({
          productName: sourceProduct.name,
          sourcePriceId: sourcePrice.id,
          error: (err as Error).message,
        });
      }
    }
  }

  // Suggest .env values: pick the first monthly + yearly recurring prices we just created or already had in target
  const finalTargetPrices = targetCatalog.flatMap((p) => p.prices);
  const monthly = finalTargetPrices.find(
    (p) => p.recurring?.interval === 'month' && p.recurring.interval_count === 1 && p.active,
  );
  const yearly = finalTargetPrices.find(
    (p) => p.recurring?.interval === 'year' && p.recurring.interval_count === 1 && p.active,
  );

  return {
    targetMode,
    sourceMode,
    created,
    skipped,
    errors,
    summary: {
      createdCount: created.length,
      skippedCount: skipped.length,
      errorCount: errors.length,
    },
    suggestedEnv:
      monthly && yearly
        ? `VITE_STRIPE_PRICE_MONTHLY=${monthly.id}\nVITE_STRIPE_PRICE_YEARLY=${yearly.id}`
        : null,
    message:
      created.length > 0
        ? `Cloned ${created.length} price(s) from ${sourceMode.toUpperCase()} to ${targetMode.toUpperCase()}.`
        : `No prices needed cloning — ${targetMode.toUpperCase()} already had equivalents for everything in ${sourceMode.toUpperCase()}.`,
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
    } else if (action === 'compare-modes') {
      result = await compareModes(req);
    } else if (action === 'clone-prices') {
      result = await clonePrices(req);
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
