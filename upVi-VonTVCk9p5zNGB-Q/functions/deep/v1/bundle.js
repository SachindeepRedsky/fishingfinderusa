function getEnv(key) {

  try {

    return Deno.env.get(key)?.trim() || "";

  } catch (_) {

    return "";

  }

}
 
function base64ToBytes(b64) {

  const binary = atob(b64);

  const bytes = new Uint8Array(binary.length);
 
  for (let i = 0; i < binary.length; i++) {

    bytes[i] = binary.charCodeAt(i);

  }
 
  return bytes;

}
 
function pemToPkcs8Bytes(pem) {

  const body = String(pem)

    .replace(/\\n/g, "\n")

    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "")

    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, "")

    .replace(/\s+/g, "");
 
  return base64ToBytes(body);

}
 
Deno.serve(async () => {

  try {

    const raw = getEnv(

      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"

    );
 
    const credentials = JSON.parse(raw);
 
    const privateKey =

      pemToPkcs8Bytes(

        credentials.private_key

      );
 
    const key =

      await crypto.subtle.importKey(

        "pkcs8",

        privateKey,

        {

          name: "RSASSA-PKCS1-v1_5",

          hash: "SHA-256"

        },

        false,

        ["sign"]

      );
 
    const message =

      new TextEncoder().encode("test");
 
    const signature =

      await crypto.subtle.sign(

        "RSASSA-PKCS1-v1_5",

        key,

        message

      );
 
    return new Response(

      JSON.stringify({

        success: true,

        step: "minimal-rs256",

        signatureBytes:

          signature.byteLength

      }),

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

        step: "minimal-rs256",

        message:

          error instanceof Error

            ? error.message

            : String(error)

      }),

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
 