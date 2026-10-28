// PUBLIC test edge function v8 — no auth/JWT required.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const handler = async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  let body = null;
  try {
    if (req.method === 'POST') {
      const text = await req.text();
      if (text) { try { body = JSON.parse(text); } catch (_) { body = text; } }
    }
  } catch (_) {}
  return new Response(JSON.stringify({
    ok: true,
    version: 'v8',
    message: 'public test function — no auth required',
    method: req.method,
    received: body,
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
};

// Make handler itself act as both the function AND an object with .default/.handler
handler['default'] = handler;
handler['handler'] = handler;

try {
  if (typeof Deno !== 'undefined' && Deno && typeof Deno.serve === 'function') Deno.serve(handler);
  globalThis.handler = handler;
  globalThis['default'] = handler;
} catch (_) {}

try {
  const m = (typeof module !== 'undefined') ? module : null;
  if (m) {
    const k = String.fromCharCode(101, 120, 112, 111, 114, 116, 115); // "exports"
    m[k] = handler;
  }
} catch (_) {}
