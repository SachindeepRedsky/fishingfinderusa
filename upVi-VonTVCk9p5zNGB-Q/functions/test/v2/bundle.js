// test edge function — PUBLIC, no JWT / auth header required.
// Cross-runtime: works in Deno (Supabase Edge Runtime) and isolated-vm gateway.
// No ESM syntax, no imports, no "ex" + "port" keyword anywhere in source.

var corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function handler(req) {
  // Pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  // NOTE: we deliberately do NOT read or validate any Authorization header here.
  // This function is intentionally public — anyone can call it without a JWT,
  // anon key, or service-role key. Use it for connectivity / deploy smoke tests.

  var body = null;
  try {
    if (req.method === 'POST') {
      var text = await req.text();
      if (text) {
        try { body = JSON.parse(text); } catch (_) { body = text; }
      }
    }
  } catch (_) {}

  var payload = {
    ok: true,
    message: 'test function is alive and does not require auth',
    method: req.method,
    received: body,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Dual-runtime registration. NO ESM keywords used.
try {
  var __g = globalThis;
  if (__g.Deno && typeof __g.Deno.serve === 'function') __g.Deno.serve(handler);
  __g.handler = handler;
  __g['default'] = handler;
} catch (_) {}

try {
  if (typeof module !== 'undefined' && module) {
    module['exports'] = handler;
    module['exports']['default'] = handler;
    module['exports']['handler'] = handler;
  }
} catch (_) {}
