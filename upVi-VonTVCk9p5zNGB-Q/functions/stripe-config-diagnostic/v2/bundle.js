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
    // Call prices.list — exercises the same permission checkout uses
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

function buildIssues(
  secretCheck: SecretCheck,
  apiTest: ApiTestResult,
  publishableMode: string | null,
): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const rawSecret = Deno.env.get('STRIPE_SECRET_KEY');

  // Issue 1: missing entirely
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
    return issues; // remaining checks need the key
  }

  const kind = detectKeyKind(rawSecret);
  const secretMode = keyMode(rawSecret);

  // Issue 2: publishable key pasted into secret slot
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

  // Issue 3: restricted key (rk_*) — likely missing checkout permissions
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

  // Issue 4: unknown prefix
  if (kind === 'unknown') {
    issues.push({
      id: 'unknown-prefix',
      severity: 'critical',
      title: 'STRIPE_SECRET_KEY has an unrecognized format',
      detail: `The configured value does not start with sk_test_, sk_live_, pk_*, or rk_*. Stripe will not accept it.`,
      fix: 'Copy a fresh Secret key from https://dashboard.stripe.com/apikeys and re-paste it. Make sure no leading/trailing whitespace, quotes, or "Bearer " prefix was included.',
      docsUrl: 'https://dashboard.stripe.com/apikeys',
    });
  }

  // Issue 5: mode mismatch between secret key and publishable key
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

  // Issue 6: real API call failed — surface the precise Stripe error
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

  return issues;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Frontend mode is sent in the request body (best-effort) so we can detect mode mismatch.
    let publishableMode: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.publishableMode === 'string') {
        publishableMode = body.publishableMode;
      }
    } catch {
      // body optional
    }

    const secretCheck = checkStripeSecretKey();
    const webhookCheck = checkStripeWebhookSecret();
    const checks: SecretCheck[] = [secretCheck, webhookCheck];

    const liveTest = await testStripeApiCall();
    const issues = buildIssues(secretCheck, liveTest, publishableMode);

    const allRequiredConfigured = checks
      .filter((c) => c.required)
      .every((c) => c.configured && c.format === 'valid');

    const result = {
      timestamp: new Date().toISOString(),
      allRequiredConfigured,
      readyForPayments: allRequiredConfigured && liveTest.ok && issues.length === 0,
      checks,
      liveApiTest: liveTest,
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
