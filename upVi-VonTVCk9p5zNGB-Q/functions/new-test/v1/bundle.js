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
 
Deno.serve(async () => {
  try {
    const dbKey =
      getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
      getEnv("SERVICE_ROLE_KEY") ||
      getEnv("SUPABASE_ANON_KEY") ||
      getEnv("ANON_KEY");
 
    const googleJson = getEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    const packageName = getEnv("GOOGLE_PLAY_PACKAGE_NAME");
 
    return json({
      success: true,
 
      environment: {
        databaseKeyConfigured: !!dbKey,
        googleServiceAccountConfigured: !!googleJson,
        googlePackageConfigured: !!packageName,
      },
 
      values: {
        googlePackageName: packageName || null,
 
        // Secret values intentionally NOT returned
        databaseKeyLength: dbKey ? dbKey.length : 0,
        googleServiceAccountLength: googleJson
          ? googleJson.length
          : 0,
      },
 
      message: "Environment test completed.",
    });
  } catch (error) {
    return json(
      {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});