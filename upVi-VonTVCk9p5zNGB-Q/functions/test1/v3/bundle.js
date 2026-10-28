export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

const func = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // This function is intentionally public - it does NOT verify any JWT or auth header.
  // Anyone with the URL can call it.
  let payload: any = {};
  try {
    if (req.method === 'POST') {
      payload = await req.json();
    }
  } catch (_) {
    payload = {};
  }

  const data = {
    ok: true,
    message: 'Hello from public test1 edge function!',
    method: req.method,
    receivedBody: payload,
    timestamp: new Date().toISOString(),
    public: true
  };

  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

Deno.serve(func);