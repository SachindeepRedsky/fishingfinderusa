const GATEWAY_BASE = "https://stripe.gateway.fastrouter.io";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, name } = await req.json();

    const GATEWAY_API_KEY = Deno.env.get("GATEWAY_API_KEY");

    if (!GATEWAY_API_KEY) {
      throw new Error("Missing GATEWAY_API_KEY");
    }

    const res = await fetch(`${GATEWAY_BASE}/payments/payment-methods`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": GATEWAY_API_KEY,
      },
      body: JSON.stringify({
        card: {
          // ⚠️ IMPORTANT:
          // Gateway must support tokenization OR you must pass Stripe PM instead
        },
        billing_details: {
          name,
          email,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Gateway error");
    }

    return new Response(
      JSON.stringify({
        id: data.id,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});