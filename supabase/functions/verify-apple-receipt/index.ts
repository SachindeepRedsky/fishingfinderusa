// verify-apple-receipt
// Verifies an Apple IAP receipt and saves the subscription row.
//
// IMPORTANT IMPLEMENTATION NOTES (do not "simplify" these away):
// 1. Do NOT use @supabase/supabase-js here — the bundled client in this
//    runtime builds relative URLs ("rest/v1/...") which crash fetch().
//    We call the REST API directly with an absolute URL.
// 2. Do NOT use upsert / on_conflict — this platform's REST layer returns
//    42P10 ("no unique or exclusion constraint matching the ON CONFLICT
//    specification") even though the unique constraint exists.
//    We use a verified select -> update-or-insert flow instead.

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
const PROJECT_URL = "https://xybqfeyhvifnstkhooba.supabase.co";
const REST_URL = `${PROJECT_URL}/rest/v1`;

const DB_KEY =
  getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
  getEnv("SERVICE_ROLE_KEY") ||
  getEnv("SUPABASE_ANON_KEY") ||
  getEnv("ANON_KEY");

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

function dbHeaders(): Record<string, string> {
  return {
    apikey: DB_KEY,
    Authorization: `Bearer ${DB_KEY}`,
    "Content-Type": "application/json",
  };
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

// Verified select -> update-or-insert flow (see notes at top of file).
async function saveSubscription(
  userId: string,
  fields: Record<string, unknown>,
) {
  const encodedUser = encodeURIComponent(userId);

  // 1. Does a row for this user already exist?
  const selRes = await fetch(
    `${REST_URL}/subscriptions?user_id=eq.${encodedUser}&select=id&limit=1`,
    { headers: dbHeaders() },
  );
  const selText = await selRes.text();
  if (!selRes.ok) {
    throw new Error(
      `Subscription lookup failed (HTTP ${selRes.status}): ${selText}`,
    );
  }

  let existing: any[] = [];
  try {
    existing = JSON.parse(selText);
  } catch {
    existing = [];
  }

  let res: Response;
  if (Array.isArray(existing) && existing.length > 0) {
    // 2a. Update the existing row (keyed by user_id).
    res = await fetch(`${REST_URL}/subscriptions?user_id=eq.${encodedUser}`, {
      method: "PATCH",
      headers: { ...dbHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(fields),
    });
  } else {
    // 2b. Insert a fresh row.
    res = await fetch(`${REST_URL}/subscriptions`, {
      method: "POST",
      headers: { ...dbHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({ user_id: userId, ...fields }),
    });
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Subscription save failed (HTTP ${res.status}): ${text}`,
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
            "Database API key is not configured (SUPABASE_SERVICE_ROLE_KEY missing).",
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
          message:
            "A valid userId (UUID) is required to save the subscription.",
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

    // 3. Save subscription keyed by user_id.
    // Stripe columns are intentionally omitted so an Apple purchase never
    // wipes existing Stripe identifiers on the same row.
    const row = await saveSubscription(body.userId, {
      status,
      plan,
      current_period_start: purchaseDate,
      current_period_end: expiryDate,
      updated_at: new Date().toISOString(),
    });

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
