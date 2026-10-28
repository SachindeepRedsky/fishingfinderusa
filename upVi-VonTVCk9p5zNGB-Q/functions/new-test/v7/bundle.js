function getEnv(key) {

  try {

    const value = Deno.env.get(key);

    return typeof value === "string" ? value.trim() : "";

  } catch (_) {

    return "";

  }

}
 
Deno.serve(async () => {

  try {

    const raw = getEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
 
    return new Response(

      JSON.stringify({

        success: true,

        step: "environment",

        configured: !!raw,

        length: raw.length,

        message: raw

          ? "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is available."

          : "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing."

      }, null, 2),

      {

        status: 200,

        headers: {

          "Content-Type": "application/json"

        }

      }

    );

  } catch (error) {

    return new Response(

      JSON.stringify({

        success: false,

        step: "environment",

        error: error instanceof Error

          ? error.message

          : String(error)

      }, null, 2),

      {

        status: 500,

        headers: {

          "Content-Type": "application/json"

        }

      }

    );

  }

});
 