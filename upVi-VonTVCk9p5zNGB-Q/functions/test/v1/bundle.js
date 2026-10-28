// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { withSupabase } from "jsr:@supabase/server@^1";
import Stripe from "npm:stripe";

// Initialize Stripe (uncomment and use your env vars)
// const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
//   httpClient: Stripe.createFetchHttpClient(),
// });

Deno.serve(
  withSupabase({ auth: "none" }, async (req, { supabaseAdmin }) => {
    try {
      const body = await req.text();
      const sig = req.headers.get("stripe-signature");

      if (!sig) {
        return new Response("Missing signature", { status: 400 });
      }

      // Mocking event for now as per your snippet
      const event = { id: "evt_test_123", type: "checkout.session.completed" };

      // Example DB Operation
      const { data, error } = await supabaseAdmin
        .from('test')
        .insert([{ column_name: 'value', other_column: 'value2' }])
        .select();

      if (error) {
        console.error("Supabase Error:", error.message);
        throw error;
      }

      console.log("Data inserted:", data);

      /*
      // Real Stripe Verification logic:
      // const event = await stripe.webhooks.constructEventAsync(
      //   body,
      //   sig,
      //   Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
      // );
      */

      console.log(`🔔 Event received: ${event.id}`);
      return Response.json({ received: true });

    } catch (err) {
      console.error(`Error: ${err.message}`);
      return Response.json({ error: err.message }, { status: 400 });
    }
  })
);