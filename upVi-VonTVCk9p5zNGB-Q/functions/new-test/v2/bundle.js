function getEnv(key) {
  try {
    const g = globalThis;
 
    if (g.Deno?.env?.get) {
      const value = g.Deno.env.get(key);
      if (typeof value === "string") return value.trim();
    }
 
    if (typeof g.process?.env?.[key] === "string") {
      return g.process.env[key].trim();
    }
  } catch (_) {}
 
  return "";
}
 
const PROJECT_URL =
  "https://erbligiwkdfwxkhvwepw.databasepad.com";
 
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
};
 
function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
 
function dbHeaders() {
  return {
    apikey: DB_KEY,
    Authorization: `Bearer ${DB_KEY}`,
    "Content-Type": "application/json",
  };
}
 
Deno.serve(async () => {
  try {
    if (!DB_KEY) {
      return json(
        {
          success: false,
          step: "database-key",
          message: "Database key is missing.",
        },
        500
      );
    }
 
    const response = await fetch(
      `${REST_URL}/subscriptions?select=id&limit=1`,
      {
        method: "GET",
        headers: dbHeaders(),
      }
    );
 
    const text = await response.text();
 
    return json({
      success: response.ok,
      step: "database-connection",
      httpStatus: response.status,
      response: text,
      message: response.ok
        ? "Database connection is working."
        : "Database request failed.",
    });
  } catch (error) {
    return json(
      {
        success: false,
        step: "database-connection",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});