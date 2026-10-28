import { createClient } from "npm:@supabase/supabase-js@2";

const APPLE_PRODUCTION_VERIFY_URL = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX_VERIFY_URL = "https://sandbox.itunes.apple.com/verifyReceipt";
const APPLE_SHARED_SECRET = Deno.env.get("APPLE_IAP_SHARED_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const planFromProductId = (productId?: string) => {
  if (!productId) return "unknown";
  if (/monthly/i.test(productId)) return "monthly";
  if (/yearly|annual/i.test(productId)) return "yearly";
  return productId;
};

const normalizeReceiptInfo = (latestReceiptInfo: unknown) => {
  if (!Array.isArray(latestReceiptInfo)) {
    return null;
  }

  return latestReceiptInfo.reduce((best, current) => {
    if (!current || typeof current !== "object") return best;
    const currentExpires = Number((current as { expires_date_ms?: string }).expires_date_ms || 0);
    const bestExpires = Number((best as { expires_date_ms?: string }).expires_date_ms || 0);
    if (!best || currentExpires > bestExpires) {
      return current;
    }
    return best;
  }, null as Record<string, unknown> | null);
};

const appleVerify = async (receipt: string) => {
  const body = {
    "receipt-data": receipt,
    "exclude-old-transactions": true,
    "password": APPLE_SHARED_SECRET,
  };

  const response = await fetch(APPLE_PRODUCTION_VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data?.status === 21007) {
    const sandboxResponse = await fetch(APPLE_SANDBOX_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return await sandboxResponse.json();
  }

  return data;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();

    const action = body?.action;
    const platform = body?.platform;
    const userId = body?.userId;
    const productId = body?.productId;
    const receipt = body?.receipt;
    const transactionId = body?.transactionId;

    if (action !== "verify-apple-receipt" || platform !== "apple") {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Invalid Apple receipt verification request.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (!userId || !receipt) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing userId or receipt payload.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const applePayload = await appleVerify(receipt);

    if (applePayload?.status !== 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Apple receipt verification failed: ${applePayload?.status ?? "unknown status"}`,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const latestReceiptInfo = normalizeReceiptInfo(applePayload?.latest_receipt_info);
    const normalizedProductId = productId || (latestReceiptInfo as { product_id?: string })?.product_id || "unknown";
    const normalizedPlan = planFromProductId(normalizedProductId);
    const currentPeriodStart = latestReceiptInfo?.purchase_date_ms
      ? new Date(Number(latestReceiptInfo.purchase_date_ms)).toISOString()
      : null;
    const currentPeriodEnd = latestReceiptInfo?.expires_date_ms
      ? new Date(Number(latestReceiptInfo.expires_date_ms)).toISOString()
      : null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing Supabase environment variables.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const subscriptionPayload = {
      user_id: userId,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      status: "active",
      plan: normalizedPlan,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase.from("subscriptions").upsert(subscriptionPayload, {
      onConflict: "user_id",
      ignoreDuplicates: false,
    });

    if (upsertError) {
      throw upsertError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Apple receipt verified and subscription saved.",
        transactionId: transactionId || latestReceiptInfo?.transaction_id || null,
        productId: normalizedProductId,
        plan: normalizedPlan,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        success: false,
        message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
