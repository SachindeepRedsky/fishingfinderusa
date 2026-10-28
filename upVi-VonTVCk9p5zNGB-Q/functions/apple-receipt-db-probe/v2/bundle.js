export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function getEnv(key: string): string {
  try {
    const g: any = globalThis;
    if (g.Deno?.env?.get) {
      const v = g.Deno.env.get(key);
      if (typeof v === "string") return v.trim();
    }
    if (typeof g.process?.env?.[key] === "string") return g.process.env[key].trim();
  } catch (_) {}
  return "";
}

const REST_URL = "https://erbligiwkdfwxkhvwepw.databasepad.com/rest/v1";
const DB_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY") || getEnv("SUPABASE_ANON_KEY") || getEnv("ANON_KEY");

function dbHeaders() {
  return {
    apikey: DB_KEY,
    Authorization: `Bearer ${DB_KEY}`,
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.userId;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, message: "userId required" }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const payload = {
      user_id: userId,
      status: body.status ?? "expired",
      plan: body.plan ?? "probe",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Step 1: check for existing row
    const selRes = await fetch(
      `${REST_URL}/subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
      { headers: dbHeaders() }
    );
    const selText = await selRes.text();
    if (!selRes.ok) {
      return new Response(JSON.stringify({ ok: false, step: "select", status: selRes.status, body: selText }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    let existing: any[] = [];
    try { existing = JSON.parse(selText); } catch {}

    let res: Response;
    let mode: string;
    if (Array.isArray(existing) && existing.length > 0) {
      mode = "update";
      const { user_id: _omit, ...updateFields } = payload;
      res = await fetch(
        `${REST_URL}/subscriptions?user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: { ...dbHeaders(), Prefer: "return=representation" },
          body: JSON.stringify(updateFields),
        }
      );
    } else {
      mode = "insert";
      res = await fetch(`${REST_URL}/subscriptions`, {
        method: "POST",
        headers: { ...dbHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
    }

    const text = await res.text();
    return new Response(JSON.stringify({ ok: res.ok, step: mode, status: res.status, body: text }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
