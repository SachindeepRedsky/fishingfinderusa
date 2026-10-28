import { createClient } from "npm:@supabase/supabase-js@2";

function getEnv(key: string): string {
  try {
    const g: any = globalThis;

    if (g.Deno?.env?.get) {
      const value = g.Deno.env.get(key);
      if (typeof value === "string") return value.trim();
    }

    if (typeof g.process?.env?.[key] === "string") {
      return g.process.env[key].trim();
    }

    if (typeof g.__env__?.[key] === "string") {
      return g.__env__[key].trim();
    }
  } catch (_) {}

  return "";
}

function normalizeSupabaseUrl(raw: string): string {
  if (!raw) return "";

  try {
    return new URL(raw).toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

const APPLE_PRODUCTION_VERIFY_URL =
  "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX_VERIFY_URL =
  "https://sandbox.itunes.apple.com/verifyReceipt";

const APPLE_SHARED_SECRET =
  getEnv("APPLE_IAP_SHARED_SECRET") ||
  "70705e54f11e4c8e8d88eb46eba880e3";

const SUPABASE_URL = normalizeSupabaseUrl(getEnv("SUPABASE_URL"));
const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY =
  getEnv("SUPABASE_ANON_KEY") || SUPABASE_SERVICE_ROLE_KEY;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function planFromProductId(productId?: string) {
  if (!productId) return "unknown";
  if (/monthly/i.test(productId)) return "monthly";
  if (/year|annual/i.test(productId)) return "yearly";
  return productId;
}

function normalizeReceiptInfo(receipts: any[]) {
  if (!Array.isArray(receipts)) return null;

  return receipts.reduce((best, current) => {
    if (!best) return current;

    const bestExpire = Number(best.expires_date_ms || 0);
    const currentExpire = Number(current.expires_date_ms || 0);

    return currentExpire > bestExpire ? current : best;
  }, null);
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";

  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function verifyAppleReceipt(receipt: string) {
  const body = {
    "receipt-data": receipt,
    password: APPLE_SHARED_SECRET,
    "exclude-old-transactions": true,
  };

  let response = await fetch(APPLE_PRODUCTION_VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let result = await response.json();

  if (result.status === 21007) {
    response = await fetch(APPLE_SANDBOX_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    result = await response.json();
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({
        success: false,
        message: "Supabase environment variables are missing or invalid.",
      }, 500);
    }

    if (!APPLE_SHARED_SECRET) {
      return json({
        success: false,
        message: "APPLE_IAP_SHARED_SECRET is missing.",
      }, 500);
    }

    const user = await getAuthenticatedUser(req);

    if (!user) {
      return json({
        success: false,
        message: "Invalid or expired token.",
      }, 401);
    }

    const body = await req.json();

    if (
      body.action !== "verify-apple-receipt" ||
      body.platform !== "apple"
    ) {
      return json({
        success: false,
        message: "Invalid request.",
      }, 400);
    }

    if (!body.receipt) {
      return json({
        success: false,
        message: "Receipt is required.",
      }, 400);
    }

    const appleResponse = await verifyAppleReceipt(body.receipt);

    if (appleResponse.status !== 0) {
      return json({
        success: false,
        message: "Apple receipt verification failed.",
        appleStatus: appleResponse.status,
      }, 400);
    }

    const latest = normalizeReceiptInfo(
      appleResponse.latest_receipt_info || [],
    );

    const productId = body.productId ?? latest?.product_id ?? "unknown";
    const plan = planFromProductId(productId);

    const purchaseDate = latest?.purchase_date_ms
      ? new Date(Number(latest.purchase_date_ms)).toISOString()
      : null;

    const expiryDate = latest?.expires_date_ms
      ? new Date(Number(latest.expires_date_ms)).toISOString()
      : null;

    const status =
      expiryDate && new Date(expiryDate) > new Date()
        ? "active"
        : "expired";

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const payload = {
      user_id: user.id,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      status,
      plan,
      current_period_start: purchaseDate,
      current_period_end: expiryDate,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("subscriptions")
      .upsert(payload, {
        onConflict: "user_id",
      });

    if (error) throw error;

    return json({
      success: true,
      active: status === "active",
      status,
      plan,
      productId,
      transactionId:
        body.transactionId ?? latest?.transaction_id ?? null,
      current_period_end: expiryDate,
      message: "Apple receipt verified successfully.",
    });
  } catch (err) {
    return json({
      success: false,
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});