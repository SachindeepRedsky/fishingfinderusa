// verify-apple-receipt
// Verifies an Apple IAP receipt and upserts the subscription row.
// NOTE: This function intentionally does NOT use @supabase/supabase-js.
// The bundled client in this runtime builds relative URLs ("rest/v1/...")
// which crash fetch(). We call PostgREST directly with an absolute URL.

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
  } catch (_) {
    // ignore
  }
  return "";
}

const APPLE_PRODUCTION_VERIFY_URL =
  "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX_VERIFY_URL =
  "https://sandbox.itunes.apple.com/verifyReceipt";

const APPLE_SHARED_SECRET =
  getEnv("APPLE_IAP_SHARED_SECRET") || "70705e54f11e4c8e8d88eb46eba880e3";

// Hardcoded absolute project URL (same origin as src/lib/supabase.ts).
// Never derive this from env at runtime — a bad env value caused
// "Failed to parse URL from rest/v1/subscriptions" crashes previously.
const PROJECT_URL = "https://erbligiwkdfwxkhvwepw.databasepad.com";
const REST_URL = `${PROJECT_URL}/rest/v1`;

const SERVICE_ROLE_KEY =
  getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
const ANON_KEY = getEnv("SUPABASE_ANON_KEY") || getEnv("ANON_KEY");
const DB_KEY = SERVICE_ROLE_KEY || ANON_KEY;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function planFromProductId(productId?: string) {
  if (!productId) return "unknown";
  if (/monthly|month/i.test(productId)) return "monthly";
  if (/year|annual/i.test(productId)) return "yearly";
  return productId;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

// Pick the latest (highest expiry) receipt entry.
function normalizeReceiptInfo(receipts: any[]) {
  if (!Array.isArray(receipts) || receipts.length === 0) return null;
  return receipts.reduce((best, current) => {
    if (!best) return current;
    const bestExpire = Number(best?.expires_date_ms || 0);
    const currentExpire = Number(current?.expires_date_ms || 0);
    return currentExpire > bestExpire ? current : best;
  }, null as any);
}

async function verifyAppleReceipt(receipt: string) {
  const body = {
    "receipt-data": receipt,
    password: APPLE_SHARED_SECRET,
    "exclude-old-transactions": true,
  };

  let response = await fetch(APPLE_PRODUCTION_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let result = await response.json();

  // 21007 = sandbox receipt sent to production endpoint
  if (result?.status === 21007) {
    response = await fetch(APPLE_SANDBOX_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    result = await response.json();
  }

  return result;
}

// Direct PostgREST upsert (merge on user_id). Absolute URL — cannot fail
// with relative-URL parse errors like the supabase-js client did.
async function upsertSubscription(payload: Record<string, unknown>) {
  const url = `${REST_URL}/subscriptions?on_conflict=user_id`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: DB_KEY,
      Authorization: `Bearer ${DB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Subscription upsert failed (HTTP ${response.status}): ${text}`,
    );
  }

  try {
    const rows = JSON.parse(text);
    return Array.isArray(rows) ? rows[0] : rows;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!DB_KEY) {
      return json(
        {
          success: false,
          message:
            "Database API key is not configured (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY missing).",
        },
        500,
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json(
        { success: false, message: "Invalid JSON request body." },
        400,
      );
    }

    if (body?.action !== "verify-apple-receipt" || body?.platform !== "apple") {
      return json({ success: false, message: "Invalid request." }, 400);
    }

    if (!body.receipt) {
      return json({ success: false, message: "Receipt is required." }, 400);
    }

    if (!isUuid(body.userId)) {
      return json(
        {
          success: false,
          message: "A valid userId (UUID) is required to save the subscription.",
        },
        400,
      );
    }

    // 1. Verify with Apple
    const appleResponse = await verifyAppleReceipt(body.receipt);

    if (appleResponse?.status !== 0) {
      return json(
        {
          success: false,
          message: "Apple receipt verification failed.",
          appleStatus: appleResponse?.status ?? null,
        },
        400,
      );
    }

    // 2. Extract latest subscription info
    const latest = normalizeReceiptInfo(
      appleResponse.latest_receipt_info ||
        appleResponse.receipt?.in_app ||
        [],
    );

    const productId = body.productId ?? latest?.product_id ?? "unknown";
    const plan = planFromProductId(productId);

    const purchaseDate = latest?.purchase_date_ms
      ? new Date(Number(latest.purchase_date_ms)).toISOString()
      : new Date().toISOString();

    const expiryDate = latest?.expires_date_ms
      ? new Date(Number(latest.expires_date_ms)).toISOString()
      : null;

    const status =
      expiryDate && new Date(expiryDate) > new Date() ? "active" : "expired";

    // 3. Upsert subscription row keyed by user_id.
    // Stripe columns are intentionally omitted so an Apple purchase never
    // wipes existing Stripe identifiers on the same row.
    const payload = {
      user_id: body.userId,
      status,
      plan,
      current_period_start: purchaseDate,
      current_period_end: expiryDate,
      updated_at: new Date().toISOString(),
    };

    const row = await upsertSubscription(payload);

    return json({
      success: true,
      active: status === "active",
      status,
      plan,
      productId,
      transactionId: body.transactionId ?? latest?.transaction_id ?? null,
      current_period_end: expiryDate,
      subscription: row,
      message: "Apple receipt verified and subscription saved.",
    });
  } catch (err) {
    console.error("verify-apple-receipt error:", err);
    return json(
      {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});
