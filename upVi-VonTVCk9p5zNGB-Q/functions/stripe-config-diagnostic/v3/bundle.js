export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface SecretCheck {
  name: string;
  required: boolean;
  configured: boolean;
  preview: string | null;
  format: 'valid' | 'invalid' | 'missing' | 'unknown';
  formatMessage: string;
  description: string;
  scope: 'edge-function' | 'frontend';
}

interface DetectedIssue {
  id: string;
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
  fix: string;
  docsUrl?: string;
}

interface PriceValidation {
  envVar: string;
  priceId: string | null;
  expectedInterval: 'month' | 'year';
  ok: boolean;
  exists: boolean;
  active: boolean | null;
  recurring: boolean | null;
  interval: string | null;
  mode: 'test' | 'live' | 'unknown' | null;
  amount: number | null;
  currency: string | null;
  productName: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  errorType: string | null;
  errorMessage: string | null;
}

function maskSecret(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 12) return value.slice(0, 4) + '***';
  return value.slice(0, 8) + '...' + value.slice(-4);
}

function detectKeyKind(key: string): 'secret' | 'publishable' | 'restricted' | 'unknown' {
  if (key.startsWith('sk_test_') || key.startsWith('sk_live_')) return 'secret';
  if (key.startsWith('pk_test_') || key.startsWith('pk_live_')) return 'publishable';
  if (key.startsWith('rk_test_') || key.startsWith('rk_live_')) return 'restricted';
  return 'unknown';
}

function keyMode(key: string): 'test' | 'live' | 'unknown' {
  if (key.includes('_test_')) return 'test';
  if (key.includes('_live_')) return 'live';
  return 'unknown';
}

function checkStripeSecretKey(): SecretCheck {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  let format: SecretCheck['format'] = 'missing';
  let formatMessage = 'Not configured';
  if (key) {
    const kind = detectKeyKind(key);
    if (kind === 'secret') {
      if (key.length >= 50) {
        format = 'valid';
        formatMessage = `Valid ${keyMode(key).toUpperCase()} mode secret key (${key.length} chars)`;
      } else {
        format = 'invalid';
        formatMessage = `Key looks truncated (${key.length} chars, expected ~107)`;
      }
    } else if (kind === 'publishable') {
      format = 'invalid';
      formatMessage = 'This is a PUBLISHABLE key (pk_*). Secret key must start with sk_test_ or sk_live_';
    } else if (kind === 'restricted') {
      format = 'invalid';
      formatMessage = 'This is a RESTRICTED key (rk_*). Use a full secret key (sk_*) with checkout permissions';
    } else {
      format = 'invalid';
      formatMessage = 'Must start with sk_test_ or sk_live_';
    }
  }
  return {
    name: 'STRIPE_SECRET_KEY',
    required: true,
    configured: !!key,
    preview: maskSecret(key),
    format,
    formatMessage,
    description: 'Stripe secret API key. Used by edge functions to create checkout sessions, manage subscriptions, and process payments. NEVER expose this in frontend code.',
    scope: 'edge-function',
  };
}

function checkStripeWebhookSecret(): SecretCheck {
  const key = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  let format: SecretCheck['format'] = 'missing';
  let formatMessage = 'Not configured (optional but recommended for webhooks)';
  if (key) {
    if (key.startsWith('whsec_')) {
      format = 'valid';
      formatMessage = `Valid webhook signing secret (${key.length} chars)`;
    } else {
      format = 'invalid';
      formatMessage = 'Must start with whsec_';
    }
  }
  return {
    name: 'STRIPE_WEBHOOK_SECRET',
    required: false,
    configured: !!key,
    preview: maskSecret(key),
    format,
    formatMessage,
    description: 'Webhook signing secret used to verify Stripe webhook events (subscription updates, payment success, etc.). Required if you use the stripe-webhook function.',
    scope: 'edge-function',
  };
}

interface ApiTestResult {
  ok: boolean;
  message: string;
  mode: string | null;
  endpoint: string;
  httpStatus: number | null;
  errorCode: string | null;
  errorType: string | null;
  errorMessage: string | null;
}

async function testStripeApiCall(): Promise<ApiTestResult> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  const base: ApiTestResult = {
    ok: false,
    message: 'STRIPE_SECRET_KEY not set — cannot test',
    mode: null,
    endpoint: '/v1/prices?limit=1',
    httpStatus: null,
    errorCode: null,
    errorType: null,
    errorMessage: null,
  };
  if (!key) return base;

  const mode = keyMode(key);
  try {
    const res = await fetch('https://api.stripe.com/v1/prices?limit=1', {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      return {
        ok: true,
        message: `Successfully called Stripe prices.list (${mode} mode). Returned ${Array.isArray(body?.data) ? body.data.length : 0} price(s).`,
        mode,
        endpoint: '/v1/prices?limit=1',
        httpStatus: res.status,
        errorCode: null,
        errorType: null,
        errorMessage: null,
      };
    }
    const err = body?.error || {};
    return {
      ok: false,
      message: `Stripe API rejected the request: ${err.message || res.statusText} (HTTP ${res.status})`,
      mode,
      endpoint: '/v1/prices?limit=1',
      httpStatus: res.status,
      errorCode: err.code || null,
      errorType: err.type || null,
      errorMessage: err.message || res.statusText || null,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Network error reaching Stripe: ${(err as Error).message}`,
      mode,
      endpoint: '/v1/prices?limit=1',
      httpStatus: null,
      errorCode: null,
      errorType: null,
      errorMessage: (err as Error).message,
    };
  }
}

// --------------------------------------------------------------------------
// Validate that each VITE_STRIPE_PRICE_* env var resolves to a real Stripe
// Price object via GET /v1/prices/{id}, and that it is active, recurring,
// has the expected interval, and is in the same mode as the secret key.
// --------------------------------------------------------------------------
async function validatePrice(
  envVar: string,
  priceId: string | null,
  expectedInterval: 'month' | 'year',
): Promise<PriceValidation> {
  const base: PriceValidation = {
    envVar,
    priceId,
    expectedInterval,
    ok: false,
    exists: false,
    active: null,
    recurring: null,
    interval: null,
    mode: null,
    amount: null,
    currency: null,
    productName: null,
    httpStatus: null,
    errorCode: null,
    errorType: null,
    errorMessage: null,
  };

  if (!priceId) {
    base.errorMessage = `${envVar} is not set`;
    return base;
  }
  if (!priceId.startsWith('price_')) {
    base.errorMessage = `${envVar} must start with "price_" (got "${priceId.slice(0, 12)}…")`;
    return base;
  }

  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) {
    base.errorMessage = 'STRIPE_SECRET_KEY not set — cannot validate price';
    return base;
  }

  try {
    const res = await fetch(
      `https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    const body = await res.json().catch(() => ({}));
    base.httpStatus = res.status;

    if (!res.ok) {
      const err = body?.error || {};
      base.errorCode = err.code || null;
      base.errorType = err.type || null;
      base.errorMessage = err.message || res.statusText || 'Unknown error';
      return base;
    }

    base.exists = true;
    base.active = !!body.active;
    base.recurring = !!body.recurring;
    base.interval = body.recurring?.interval ?? null;
    base.mode = body.livemode ? 'live' : 'test';
    base.amount = typeof body.unit_amount === 'number' ? body.unit_amount : null;
    base.currency = body.currency || null;
    base.productName =
      typeof body.product === 'string'
        ? body.product
        : body.product?.name ?? null;

    base.ok =
      base.exists &&
      base.active === true &&
      base.recurring === true &&
      base.interval === expectedInterval;

    return base;
  } catch (err) {
    base.errorMessage = `Network error: ${(err as Error).message}`;
    return base;
  }
}

function buildIssues(
  _secretCheck: SecretCheck,
  apiTest: ApiTestResult,
  publishableMode: string | null,
  priceValidations: PriceValidation[],
): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const rawSecret = Deno.env.get('STRIPE_SECRET_KEY');

  if (!rawSecret) {
    issues.push({
      id: 'secret-missing',
      severity: 'critical',
      title: 'STRIPE_SECRET_KEY is not set',
      detail:
        'The edge functions cannot reach Stripe. Every checkout request will fail with "non-2xx status code" until this is configured.',
      fix: 'In Famous dashboard → Backend → Edge Function Secrets, add a secret named STRIPE_SECRET_KEY with a value from https://dashboard.stripe.com/apikeys (starts with sk_test_ or sk_live_).',
      docsUrl: 'https://dashboard.stripe.com/apikeys',
    });
    return issues;
  }

  const kind = detectKeyKind(rawSecret);
  const secretMode = keyMode(rawSecret);

  if (kind === 'publishable') {
    issues.push({
      id: 'pk-in-secret-slot',
      severity: 'critical',
      title: 'A publishable key (pk_*) was pasted into STRIPE_SECRET_KEY',
      detail:
        'Publishable keys cannot create checkout sessions, subscriptions, or charges. Stripe will reject every server-side API call as unauthenticated.',
      fix: 'Replace STRIPE_SECRET_KEY with a SECRET key (starts with sk_test_ or sk_live_) from https://dashboard.stripe.com/apikeys. The pk_* key belongs in VITE_STRIPE_PUBLISHABLE_KEY (frontend .env), not in edge function secrets.',
      docsUrl: 'https://dashboard.stripe.com/apikeys',
    });
  }

  if (kind === 'restricted') {
    issues.push({
      id: 'rk-restricted-key',
      severity: 'critical',
      title: 'STRIPE_SECRET_KEY is a RESTRICTED key (rk_*)',
      detail:
        'Restricted keys only have the specific permissions you granted them. If "Checkout Sessions: write", "Customers: write", and "Prices: read" are not all enabled, Stripe will reject requests with a permission error.',
      fix: 'Either (a) replace it with a full secret key (sk_*) from https://dashboard.stripe.com/apikeys, or (b) edit this restricted key in Stripe → Developers → API keys → [your rk_*] → Edit and grant: Checkout Sessions=write, Customers=write, Subscriptions=write, Prices=read, Products=read.',
      docsUrl: 'https://dashboard.stripe.com/apikeys',
    });
  }

  if (kind === 'unknown') {
    issues.push({
      id: 'unknown-prefix',
      severity: 'critical',
      title: 'STRIPE_SECRET_KEY has an unrecognized format',
      detail:
        'The configured value does not start with sk_test_, sk_live_, pk_*, or rk_*. Stripe will not accept it.',
      fix: 'Copy a fresh Secret key from https://dashboard.stripe.com/apikeys and re-paste it. Make sure no leading/trailing whitespace, quotes, or "Bearer " prefix was included.',
      docsUrl: 'https://dashboard.stripe.com/apikeys',
    });
  }

  if (
    secretMode !== 'unknown' &&
    publishableMode &&
    publishableMode !== 'unknown' &&
    secretMode !== publishableMode
  ) {
    issues.push({
      id: 'mode-mismatch',
      severity: 'critical',
      title: `Test/Live mode mismatch (secret=${secretMode}, publishable=${publishableMode})`,
      detail:
        'Your backend secret key is in a different mode than your frontend publishable key. Stripe.js will tokenize the card in one mode while the server tries to charge it in the other — every transaction will fail.',
      fix: `Use both keys from the SAME mode. Either switch STRIPE_SECRET_KEY to a ${publishableMode} mode key (sk_${publishableMode}_…), or switch VITE_STRIPE_PUBLISHABLE_KEY to a ${secretMode} mode key (pk_${secretMode}_…). Toggle test/live with the switch in the top-right of the Stripe dashboard.`,
      docsUrl: 'https://dashboard.stripe.com/apikeys',
    });
  }

  if (kind === 'secret' || kind === 'restricted') {
    if (!apiTest.ok && apiTest.httpStatus !== null) {
      const code = apiTest.errorCode || 'unknown';
      const type = apiTest.errorType || 'unknown';
      let fix =
        'Verify the key is copied exactly (no whitespace), is from the correct Stripe account, and has not been rotated/revoked. Generate a new Secret key at https://dashboard.stripe.com/apikeys if needed.';
      if (apiTest.httpStatus === 401 || code === 'invalid_api_key' || type === 'invalid_request_error') {
        fix =
          'Stripe says the key is invalid or revoked. Generate a fresh Secret key at https://dashboard.stripe.com/apikeys, paste it into STRIPE_SECRET_KEY (Edge Function Secrets), and re-run this diagnostic.';
      } else if (apiTest.httpStatus === 403 || type === 'permission_error') {
        fix =
          'The key is valid but lacks the required permissions. If using a restricted key (rk_*), edit it in Stripe → Developers → API keys and grant: Checkout Sessions=write, Customers=write, Subscriptions=write, Prices=read.';
      }
      issues.push({
        id: 'live-api-rejected',
        severity: 'critical',
        title: `Stripe API rejected the key (HTTP ${apiTest.httpStatus})`,
        detail: `Stripe error code: "${code}" · type: "${type}" · message: ${apiTest.errorMessage || 'no message'}`,
        fix,
        docsUrl: 'https://dashboard.stripe.com/apikeys',
      });
    }
  }

  // ----------------------------------------------------------------------
  // Price ID validation issues — one dedicated red card per problem
  // ----------------------------------------------------------------------
  // Only emit price-validation issues if the secret key itself is OK enough
  // to make API calls — otherwise the user would see redundant "no such
  // price" errors that are really caused by the key being broken.
  const secretUsable =
    (kind === 'secret' || kind === 'restricted') && apiTest.ok;

  for (const v of priceValidations) {
    // Missing env var
    if (!v.priceId) {
      issues.push({
        id: `price-missing-${v.envVar}`,
        severity: 'critical',
        title: `${v.envVar} is not set`,
        detail: `The ${v.expectedInterval}ly plan has no Stripe Price ID configured. The checkout button for that plan will fail.`,
        fix: `Add ${v.envVar}=price_… to your .env file (find the ID at https://dashboard.stripe.com/prices), then restart your dev server / redeploy.`,
        docsUrl: 'https://dashboard.stripe.com/prices',
      });
      continue;
    }

    // Bad prefix
    if (!v.priceId.startsWith('price_')) {
      issues.push({
        id: `price-bad-prefix-${v.envVar}`,
        severity: 'critical',
        title: `${v.envVar} is not a valid price ID`,
        detail: `Value "${v.priceId.slice(0, 24)}${v.priceId.length > 24 ? '…' : ''}" does not start with "price_". Stripe Price IDs always begin with "price_".`,
        fix: `Open https://dashboard.stripe.com/prices, click your ${v.expectedInterval}ly recurring price, copy its ID (begins with "price_"), and paste it into ${v.envVar} in .env.`,
        docsUrl: 'https://dashboard.stripe.com/prices',
      });
      continue;
    }

    // If we couldn't even reach Stripe, skip the rest (already covered by live-api-rejected)
    if (!secretUsable) continue;

    // Stripe rejected the lookup — typically "No such price"
    if (!v.exists) {
      const code = v.errorCode || 'resource_missing';
      const isMissing =
        code === 'resource_missing' ||
        v.httpStatus === 404 ||
        (v.errorMessage || '').toLowerCase().includes('no such price');

      if (isMissing) {
        // Most common: price exists in the OTHER mode
        const secretModeUpper = secretMode.toUpperCase();
        issues.push({
          id: `price-not-found-${v.envVar}`,
          severity: 'critical',
          title: `Stripe says: "No such price" for ${v.envVar}`,
          detail: `Price ID "${v.priceId}" was not found in your ${secretModeUpper} mode account. The most common cause is that this price was created in the OTHER mode (test vs live) than your STRIPE_SECRET_KEY. Stripe error: ${v.errorMessage || 'resource_missing'}`,
          fix: `Open https://dashboard.stripe.com/${secretMode === 'live' ? '' : 'test/'}prices (${secretModeUpper} mode), copy the correct ${v.expectedInterval}ly price ID, and paste it into ${v.envVar}. Or switch STRIPE_SECRET_KEY to match the mode the price was created in.`,
          docsUrl: `https://dashboard.stripe.com/${secretMode === 'live' ? '' : 'test/'}prices`,
        });
      } else {
        issues.push({
          id: `price-lookup-failed-${v.envVar}`,
          severity: 'critical',
          title: `Stripe rejected lookup of ${v.envVar} (HTTP ${v.httpStatus ?? '?'})`,
          detail: `Code: "${v.errorCode || 'unknown'}" · type: "${v.errorType || 'unknown'}" · message: ${v.errorMessage || 'no message'}`,
          fix: `Verify ${v.priceId} exists in https://dashboard.stripe.com/prices under the same Stripe account that owns STRIPE_SECRET_KEY, and that the key has prices:read permission.`,
          docsUrl: 'https://dashboard.stripe.com/prices',
        });
      }
      continue;
    }

    // Price found — now validate its properties

    // Mode mismatch (price was created in different mode than the secret key)
    if (v.mode && secretMode !== 'unknown' && v.mode !== secretMode) {
      issues.push({
        id: `price-mode-mismatch-${v.envVar}`,
        severity: 'critical',
        title: `${v.envVar} is a ${v.mode.toUpperCase()} mode price but STRIPE_SECRET_KEY is ${secretMode.toUpperCase()}`,
        detail: `Stripe stores test and live data in completely separate sandboxes. A ${v.mode} mode price cannot be charged with a ${secretMode} mode key — checkout will fail with "No such price".`,
        fix: `Either (a) recreate the price in ${secretMode.toUpperCase()} mode at https://dashboard.stripe.com/${secretMode === 'live' ? '' : 'test/'}prices and update ${v.envVar}, or (b) switch STRIPE_SECRET_KEY to a ${v.mode} mode key (sk_${v.mode}_…) so it matches the price.`,
        docsUrl: `https://dashboard.stripe.com/${secretMode === 'live' ? '' : 'test/'}prices`,
      });
      // continue checks — still useful to know if it's also inactive/wrong interval
    }

    // Inactive (archived)
    if (v.active === false) {
      issues.push({
        id: `price-inactive-${v.envVar}`,
        severity: 'critical',
        title: `${v.envVar} points to an ARCHIVED price`,
        detail: `Price ${v.priceId} exists but has active=false. Stripe Checkout refuses to use archived prices and returns an error to the customer.`,
        fix: `Open https://dashboard.stripe.com/prices, find ${v.priceId}, and either click "Activate" or create a new active ${v.expectedInterval}ly price and update ${v.envVar} with the new ID.`,
        docsUrl: 'https://dashboard.stripe.com/prices',
      });
    }

    // One-time (not recurring)
    if (v.recurring === false) {
      issues.push({
        id: `price-not-recurring-${v.envVar}`,
        severity: 'critical',
        title: `${v.envVar} is a ONE-TIME price, not a subscription`,
        detail: `Price ${v.priceId} is not recurring. The app's checkout flow uses subscription mode and requires a recurring price with interval=${v.expectedInterval}.`,
        fix: `In https://dashboard.stripe.com/products, create a recurring price (Standard pricing → Recurring → bill every 1 ${v.expectedInterval}) and replace ${v.envVar} with the new price ID.`,
        docsUrl: 'https://dashboard.stripe.com/products',
      });
    }

    // Wrong interval (e.g. yearly env var pointing at a monthly price)
    if (
      v.recurring === true &&
      v.interval &&
      v.interval !== v.expectedInterval
    ) {
      issues.push({
        id: `price-wrong-interval-${v.envVar}`,
        severity: 'critical',
        title: `${v.envVar} has interval="${v.interval}" but should be "${v.expectedInterval}"`,
        detail: `The ${v.envVar} env var is meant to drive the ${v.expectedInterval}ly plan, but the configured Stripe price bills every "${v.interval}". Customers would be charged on the wrong cadence.`,
        fix: `Open https://dashboard.stripe.com/prices, pick a price with billing interval="${v.expectedInterval}", and replace ${v.envVar} with that price's ID. Or create a new ${v.expectedInterval}ly price on the same product.`,
        docsUrl: 'https://dashboard.stripe.com/prices',
      });
    }
  }

  return issues;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let publishableMode: string | null = null;
    let priceMonthly: string | null = null;
    let priceYearly: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.publishableMode === 'string') {
        publishableMode = body.publishableMode;
      }
      if (body && typeof body.priceMonthly === 'string' && body.priceMonthly.trim()) {
        priceMonthly = body.priceMonthly.trim();
      }
      if (body && typeof body.priceYearly === 'string' && body.priceYearly.trim()) {
        priceYearly = body.priceYearly.trim();
      }
    } catch {
      // body optional
    }

    const secretCheck = checkStripeSecretKey();
    const webhookCheck = checkStripeWebhookSecret();
    const checks: SecretCheck[] = [secretCheck, webhookCheck];

    const liveTest = await testStripeApiCall();

    // Validate price IDs in parallel — only meaningful if the secret key works
    const canValidatePrices = liveTest.ok;
    const priceValidations: PriceValidation[] = canValidatePrices
      ? await Promise.all([
          validatePrice('VITE_STRIPE_PRICE_MONTHLY', priceMonthly, 'month'),
          validatePrice('VITE_STRIPE_PRICE_YEARLY', priceYearly, 'year'),
        ])
      : [
          {
            envVar: 'VITE_STRIPE_PRICE_MONTHLY',
            priceId: priceMonthly,
            expectedInterval: 'month',
            ok: false,
            exists: false,
            active: null,
            recurring: null,
            interval: null,
            mode: null,
            amount: null,
            currency: null,
            productName: null,
            httpStatus: null,
            errorCode: null,
            errorType: null,
            errorMessage: priceMonthly
              ? 'Skipped — fix STRIPE_SECRET_KEY first'
              : 'Not provided',
          },
          {
            envVar: 'VITE_STRIPE_PRICE_YEARLY',
            priceId: priceYearly,
            expectedInterval: 'year',
            ok: false,
            exists: false,
            active: null,
            recurring: null,
            interval: null,
            mode: null,
            amount: null,
            currency: null,
            productName: null,
            httpStatus: null,
            errorCode: null,
            errorType: null,
            errorMessage: priceYearly
              ? 'Skipped — fix STRIPE_SECRET_KEY first'
              : 'Not provided',
          },
        ];

    const issues = buildIssues(secretCheck, liveTest, publishableMode, priceValidations);

    const allRequiredConfigured = checks
      .filter((c) => c.required)
      .every((c) => c.configured && c.format === 'valid');

    const result = {
      timestamp: new Date().toISOString(),
      allRequiredConfigured,
      readyForPayments:
        allRequiredConfigured &&
        liveTest.ok &&
        priceValidations.every((p) => p.ok) &&
        issues.length === 0,
      checks,
      liveApiTest: liveTest,
      priceValidations,
      issues,
      missingRequired: checks
        .filter((c) => c.required && (!c.configured || c.format !== 'valid'))
        .map((c) => c.name),
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
