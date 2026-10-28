export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_BASE = "https://stripe.gateway.fastrouter.io";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const gatewayApiKey = Deno.env.get("GATEWAY_API_KEY");

    if (!gatewayApiKey) {
      throw new Error("Missing GATEWAY_API_KEY in environment");
    }

    const res = await fetch(`${GATEWAY_BASE}/payments/prices`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": gatewayApiKey,
      },
    });

    const data = await res.json();

    return new Response(
      JSON.stringify(
        {
          success: res.ok,
          count: data?.data?.length || 0,
          prices: data?.data || data,
        },
        null,
        2
      ),
      {
        status: res.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
});