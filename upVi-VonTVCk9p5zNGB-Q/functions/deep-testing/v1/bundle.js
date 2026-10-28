import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
 
Deno.serve(async () => {

  try {

    return new Response(

      JSON.stringify({

        success: true,

        step: "djwt-import",

        message: "djwt library imported successfully."

      }),

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

        step: "djwt-import",

        message:

          error instanceof Error

            ? error.message

            : String(error)

      }),

      {

        status: 500,

        headers: {

          "Content-Type": "application/json"

        }

      }

    );

  }

});
 