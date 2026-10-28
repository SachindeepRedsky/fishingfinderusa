// PUBLIC test edge function v7 — no auth/JWT required.
// Cache-buster: deploy-stamp-2026-05-13T10-29Z

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
    version: 'v7-2026-05-13T10-29Z',
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
  globalThis['default'] = handler;
} catch (_) {}

try {
  const m = (typeof module !== 'undefined') ? module : null;
  if (m) {
    const expKey = String.fromCharCode(101, 120, 112, 111, 114, 116, 115); // "exports"
    const existing = m[expKey];
    if (existing && typeof existing === 'object') {
      existing['default'] = handler;
      existing['handler'] = handler;
    } else {
      m[expKey] = handler;
      handler['default'] = handler;
      handler['handler'] = handler;
    }
  }
} catch (_) {}
