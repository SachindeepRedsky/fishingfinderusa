import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

    if (!email) {
      throw new Error("Email is required");
    }

    const apiKey = Deno.env.get("GATEWAY_API_KEY");
    if (!apiKey) throw new Error("Missing GATEWAY_API_KEY");

    // 1. Create or find customer
    const customerRes = await fetch(`${GATEWAY_BASE}/payments/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        email,
        name: name || email.split("@")[0],
      }),
    });

    const customer = await customerRes.json();
    if (!customerRes.ok) {
      throw new Error(customer.error || "Failed to create customer");
    }

    const customerId = customer.id;

    // 2. Create SetupIntent (THIS IS IMPORTANT)
    const setupRes = await fetch(`${GATEWAY_BASE}/payments/setup-intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        customer: customerId,
        usage: "off_session",
        payment_method_types: ["card"]
      }),
    });

    const setup = await setupRes.json();
    if (!setupRes.ok) {
      throw new Error(setup.error || "Failed to create setup intent");
    }

    return new Response(
      JSON.stringify({
        clientSecret: setup.clientSecret,
        customerId,
        setupIntentId: setup.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});