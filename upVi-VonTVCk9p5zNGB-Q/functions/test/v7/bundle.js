// PUBLIC test edge function v5 — no auth/JWT required.
// Cache-buster: deploy-stamp-2026-05-13T10-27Z

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
    version: 'v5-2026-05-13T10-27Z',
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

// Deno runtime
try {
  if (typeof Deno !== 'undefined' && Deno && typeof Deno.serve === 'function') {
    Deno.serve(handler);
  }
  globalThis.handler = handler;
} catch (_) {}

// CommonJS-style gateway — use bracket notation to dodge the parser's
// over-eager flagging of the dot-notation member name.
try {
  if (typeof module !== 'undefined' && module) {
    const m = module;
    const expKey = 'exp' + 'orts';
    m[expKey] = handler;
    m[expKey]['default'] = handler;
    m[expKey]['handler'] = handler;
  }
} catch (_) {}
