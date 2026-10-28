Deno.serve(async () => {

  try {

    const nodeCrypto =

      await import("node:crypto");
 
    return new Response(

      JSON.stringify({

        success: true,

        step: "node-crypto",

        available: !!nodeCrypto,

        createSign:

          typeof nodeCrypto.createSign,

        message:

          "Node crypto module is available."

      }, null, 2),

      {

        status: 200,

        headers: {

          "Content-Type":

            "application/json"

        }

      }

    );
 
  } catch (error) {
 
    return new Response(

      JSON.stringify({

        success: false,

        step: "node-crypto",

        message:

          error instanceof Error

            ? error.message

            : String(error)

      }, null, 2),

      {

        status: 500,

        headers: {

          "Content-Type":

            "application/json"

        }

      }

    );

  }

});
 