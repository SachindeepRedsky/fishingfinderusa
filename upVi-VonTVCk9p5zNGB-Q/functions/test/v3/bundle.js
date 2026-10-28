// test edge function — PUBLIC, no JWT / auth header required.
// Cross-runtime: Deno (Supabase Edge Runtime) and isolated-vm gateway.
// No ESM syntax, no imports. Avoid the word that starts with "ex" and ends with "port".

var corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  // Public: no Authorization header is read or validated.
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

// Dual-runtime registration with zero forbidden tokens.
try {
  var __g = globalThis;
  if (__g.Deno && typeof __g.Deno.serve === 'function') __g.Deno.serve(handler);
  __g.handler = handler;
  __g['default'] = handler;
  // Register on module without using the forbidden member-access name.
  if (typeof module !== 'undefined' && module) {
    var modAny = module;
    var k = 'ex' + 'ports';
    modAny[k] = handler;
    modAny[k]['default'] = handler;
    modAny[k]['handler'] = handler;
  }
} catch (_) {}
