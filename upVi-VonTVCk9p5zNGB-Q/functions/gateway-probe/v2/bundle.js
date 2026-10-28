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
        'X-API-Key': apiKey || '',
        ...(init.headers || {})
      }
    });
    const text = await r.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, body };
  }

  // Try several endpoints to discover account info & publishable key
  const probes: Record<string, any> = {};
  probes.config = await call('/payments/config');
  probes.publishableKey = await call('/payments/publishable-key');
  probes.account = await call('/payments/account');
  probes.status = await call('/payments/status');

  return new Response(JSON.stringify({
    apiKeyPrefix: apiKey ? apiKey.slice(0, 12) : null,
    probes
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
});
