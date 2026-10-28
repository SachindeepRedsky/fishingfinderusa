export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Disabled diagnostic probe. Kept as a stub after debugging verify-apple-receipt.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return new Response(JSON.stringify({ ok: false, message: 'This diagnostic probe is disabled.' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
});
