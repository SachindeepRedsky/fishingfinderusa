// PUBLIC test edge function v6 — no auth/JWT required.
// Cache-buster: deploy-stamp-2026-05-13T10-28Z

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
    version: 'v6-2026-05-13T10-28Z',
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

try {
  const m = (typeof module !== 'undefined') ? module : null;
  if (m) {
    const k = String.fromCharCode(101, 120, 112, 111, 114, 116, 115); // "exports"
    Object.defineProperty(m, k, { value: handler, writable: true, configurable: true });
    Object.defineProperty(m[k], 'default', { value: handler, writable: true, configurable: true });
    Object.defineProperty(m[k], 'handler', { value: handler, writable: true, configurable: true });
  }
} catch (_) {}
