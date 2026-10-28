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
const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
const ANON_KEY = getEnv("SUPABASE_ANON_KEY") || getEnv("ANON_KEY");
const DB_KEY = SERVICE_ROLE_KEY || ANON_KEY;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const envInfo = {
      hasServiceRoleKey: !!SERVICE_ROLE_KEY,
      hasAnonKey: !!ANON_KEY,
    };

    if (!DB_KEY) {
      return new Response(JSON.stringify({ ok: false, step: "env", envInfo }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (!body.userId) {
      // Read-only probe
      const res = await fetch(`${REST_URL}/subscriptions?select=id&limit=1`, {
        headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}` }
      });
      const text = await res.text();
      return new Response(JSON.stringify({ ok: res.ok, step: "read", status: res.status, body: text, envInfo }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Write probe: identical upsert to verify-apple-receipt
    const res = await fetch(`${REST_URL}/subscriptions?on_conflict=user_id`, {
      method: "POST",
      headers: {
        apikey: DB_KEY,
        Authorization: `Bearer ${DB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        user_id: body.userId,
        status: body.status ?? "expired",
        plan: body.plan ?? "probe",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    const text = await res.text();

    return new Response(JSON.stringify({ ok: res.ok, step: "upsert", status: res.status, body: text, envInfo }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
