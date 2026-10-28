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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const test = body?.test || "all";

    // -----------------------------------------
    // TEST 1: DATABASE
    // -----------------------------------------
    if (test === "database" || test === "all") {
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

      if (test === "database") {
        return json({
          success: response.ok,
          step: "database-connection",
          httpStatus: response.status,
          response: text,
          message: response.ok
            ? "Database connection is working."
            : "Database request failed.",
        });
      }
    }

    // -----------------------------------------
    // TEST 2: GOOGLE SERVICE ACCOUNT
    // -----------------------------------------
    if (test === "google" || test === "all") {
      const raw = getEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");

      if (!raw) {
        return json(
          {
            success: false,
            step: "google-service-account",
            message:
              "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing.",
          },
          500
        );
      }

      let credentials;

      try {
        credentials = JSON.parse(raw);
      } catch (error) {
        return json(
          {
            success: false,
            step: "google-service-account-json",
            message: "Service account JSON is invalid.",
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
          500
        );
      }

      const result = {
        projectId: credentials.project_id || null,
        clientEmail: credentials.client_email || null,
        privateKeyConfigured: !!credentials.private_key,
        tokenUri: credentials.token_uri || null,
        type: credentials.type || null,
      };

      if (!credentials.client_email) {
        return json(
          {
            success: false,
            ...result,
            message: "client_email is missing.",
          },
          500
        );
      }

      if (!credentials.private_key) {
        return json(
          {
            success: false,
            ...result,
            message: "private_key is missing.",
          },
          500
        );
      }

      return json({
        success: true,
        step: "google-service-account",
        ...result,
        message: "Google service account JSON is valid.",
      });
    }

    return json({
      success: true,
      message: "No test selected.",
      availableTests: [
        "database",
        "google",
        "all",
      ],
    });
  } catch (error) {
    return json(
      {
        success: false,
        step: "unexpected-error",
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
});