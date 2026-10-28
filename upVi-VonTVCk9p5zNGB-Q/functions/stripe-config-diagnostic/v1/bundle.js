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

function maskSecret(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 12) return value.slice(0, 4) + '***';
  return value.slice(0, 8) + '...' + value.slice(-4);
}

function checkStripeSecretKey(): SecretCheck {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  let format: SecretCheck['format'] = 'missing';
  let formatMessage = 'Not configured';
  if (key) {
    if (key.startsWith('sk_test_') || key.startsWith('sk_live_')) {
      if (key.length >= 50) {
        format = 'valid';
        formatMessage = `Valid ${key.startsWith('sk_live_') ? 'LIVE' : 'TEST'} mode key (${key.length} chars)`;
      } else {
        format = 'invalid';
        formatMessage = `Key looks truncated (${key.length} chars, expected ~107)`;
      }
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

async function testStripeApiCall(): Promise<{ ok: boolean; message: string; mode: string | null }> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) {
    return { ok: false, message: 'STRIPE_SECRET_KEY not set — cannot test', mode: null };
  }
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${key}` },
    });
    const mode = key.startsWith('sk_live_') ? 'live' : key.startsWith('sk_test_') ? 'test' : 'unknown';
    if (res.ok) {
      return { ok: true, message: `Successfully authenticated with Stripe API (${mode} mode)`, mode };
    }
    const body = await res.json().catch(() => ({}));
    return {
      ok: false,
      message: `Stripe API rejected the key: ${body?.error?.message || res.statusText} (HTTP ${res.status})`,
      mode,
    };
  } catch (err) {
    return { ok: false, message: `Network error reaching Stripe: ${(err as Error).message}`, mode: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const checks: SecretCheck[] = [
      checkStripeSecretKey(),
      checkStripeWebhookSecret(),
    ];

    const liveTest = await testStripeApiCall();

    const allRequiredConfigured = checks
      .filter((c) => c.required)
      .every((c) => c.configured && c.format === 'valid');

    const result = {
      timestamp: new Date().toISOString(),
      allRequiredConfigured,
      readyForPayments: allRequiredConfigured && liveTest.ok,
      checks,
      liveApiTest: liveTest,
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
