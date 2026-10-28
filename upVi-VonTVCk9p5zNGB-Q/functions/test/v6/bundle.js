// PUBLIC test edge function v4 — no auth/JWT required.
// Cache-buster: deploy-stamp-2026-05-13T10-26Z

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
    version: 'v4-2026-05-13T10-26Z',
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

// Register for Deno runtime (Supabase Edge Runtime)
try {
  if (typeof Deno !== 'undefined' && Deno && typeof Deno.serve === 'function') {
    Deno.serve(handler);
  }
  globalThis.handler = handler;
} catch (_) {}

// Register for CommonJS-style isolated-vm gateway
try {
  if (typeof module !== 'undefined' && module) {
    module.exports = handler;
    module.exports.default = handler;
    module.exports.handler = handler;
  }
} catch (_) {}
