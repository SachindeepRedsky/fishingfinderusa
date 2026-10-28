// PUBLIC test edge function v3 — zero ESM tokens.
// Cache-buster: deploy-stamp-2026-05-13T10-25Z

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const handler = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body = null;
  try {
    if (req.method === 'POST') {
      const text = await req.text();
      if (text) {
        try { body = JSON.parse(text); } catch (_) { body = text; }
      }
    }
  } catch (_) {}

  const payload = {
    ok: true,
    version: 'v3-cache-buster-2026-05-13T10-25Z',
    message: 'public test function — no auth required',
    method: req.method,
    received: body,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
};

try {
  if (typeof Deno !== 'undefined' && Deno && typeof Deno.serve === 'function') {
    Deno.serve(handler);
  }
  globalThis.handler = handler;
} catch (_) {}
