export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// This helper function makes an UNAUTHENTICATED fetch to test1 to verify
// whether it is actually publicly reachable without a JWT.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Derive the test1 URL from this function's own URL
  const selfUrl = new URL(req.url);
  const test1Url = `${selfUrl.protocol}//${selfUrl.host}${selfUrl.pathname.replace(/test1-public-check$/, 'test1')}`;

  // Call it with NO auth headers at all
  const res = await fetch(test1Url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ probe: 'unauthenticated' })
  });

  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch (_) { /* keep as text */ }

  return new Response(JSON.stringify({
    probedUrl: test1Url,
    status: res.status,
    isPublic: res.status === 200,
    response: body
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
});
