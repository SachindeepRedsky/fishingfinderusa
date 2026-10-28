import * as rsa from "https://esm.sh/jsrsasign@11.1.0";
 
Deno.serve(async () => {
  try {
    return new Response(
      JSON.stringify({
        success: true,
        step: "rsa-library-import",
        libraryLoaded: !!rsa,
        message: "Pure-JS RSA library imported successfully."
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
        step: "rsa-library-import",
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