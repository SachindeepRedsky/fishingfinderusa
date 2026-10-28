export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const apiKey = Deno.env.get('GATEWAY_API_KEY');
  const base = 'https://stripe.gateway.fastrouter.io';

  async function call(path: string, init: RequestInit = {}) {
    const r = await fetch(base + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey || '',
        ...(init.headers || {})
      }
    });
    const text = await r.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, body };
  }

  // Probe: create a customer + setup intent and inspect their livemode + account hints
  const status = await call('/payments/status');
  const setupIntentCreate = await call('/payments/setup-intents', {
    method: 'POST',
    body: JSON.stringify({ metadata: { probe: 'true' } })
  });

  return new Response(JSON.stringify({
    apiKeyPresent: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.slice(0, 8) : null,
    accountStatus: status,
    setupIntent: setupIntentCreate
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
});
