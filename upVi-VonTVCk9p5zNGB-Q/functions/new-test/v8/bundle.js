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

    const raw = getEnv(

      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"

    );
 
    if (!raw) {

      throw new Error(

        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing."

      );

    }
 
    let credentials;
 
    try {

      credentials = JSON.parse(raw);

    } catch (error) {

      return new Response(

        JSON.stringify({

          success: false,

          step: "json-parse",

          message: "JSON parsing failed.",

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
 
    return new Response(

      JSON.stringify({

        success: true,

        step: "json-parse",
 
        type: credentials.type || null,

        projectId: credentials.project_id || null,

        clientEmail: credentials.client_email || null,

        privateKeyConfigured:

          !!credentials.private_key,

        tokenUri: credentials.token_uri || null,
 
        message:

          "Google service account JSON parsed successfully."

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

        step: "json-parse",

        message: error instanceof Error

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
 