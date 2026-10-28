import {

  create,

  getNumericDate

} from "https://deno.land/x/djwt@v3.0.2/mod.ts";
 
function getEnv(key) {

  try {

    const value = Deno.env.get(key);

    return typeof value === "string"

      ? value.trim()

      : "";

  } catch (_) {

    return "";

  }

}
 
function base64ToBytes(b64) {

  const binary = atob(b64);
 
  const bytes =

    new Uint8Array(binary.length);
 
  for (let i = 0; i < binary.length; i++) {

    bytes[i] =

      binary.charCodeAt(i);

  }
 
  return bytes;

}
 
function pemToPkcs8Bytes(pem) {

  const normalized =

    String(pem)

      .replace(/\\n/g, "\n")

      .trim();
 
  const body =

    normalized

      .replace(

        /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,

        ""

      )

      .replace(

        /-----END [A-Z ]*PRIVATE KEY-----/g,

        ""

      )

      .replace(/\s+/g, "");
 
  if (!body) {

    throw new Error(

      "Private key body is empty."

    );

  }
 
  return base64ToBytes(body);

}
 
Deno.serve(async () => {

  try {

    const raw =

      getEnv(

        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"

      );
 
    if (!raw) {

      throw new Error(

        "Service account JSON missing."

      );

    }
 
    const credentials =

      JSON.parse(raw);
 
    const clientEmail =

      credentials.client_email;
 
    const privateKeyPem =

      credentials.private_key;
 
    if (!clientEmail) {

      throw new Error(

        "client_email missing."

      );

    }
 
    if (!privateKeyPem) {

      throw new Error(

        "private_key missing."

      );

    }
 
    // --------------------------------

    // Convert PEM → PKCS8

    // --------------------------------
 
    const privateKeyBytes =

      pemToPkcs8Bytes(

        privateKeyPem

      );
 
    // --------------------------------

    // Import as RSASSA-PKCS1-v1_5

    // --------------------------------
 
    const key =

      await crypto.subtle.importKey(

        "pkcs8",

        privateKeyBytes,

        {

          name:

            "RSASSA-PKCS1-v1_5",

          hash: "SHA-256"

        },

        false,

        ["sign"]

      );
 
    // --------------------------------

    // Check imported key

    // --------------------------------
 
    const keyInfo = {

      type: key.type,

      algorithm:

        key.algorithm,

      extractable:

        key.extractable,

      usages:

        key.usages

    };
 
    // --------------------------------

    // IMPORTANT:

    // djwt expects RS256.

    // --------------------------------
 
    const jwt =

      await create(

        {

          alg: "RS256",

          typ: "JWT"

        },

        {

          iss: clientEmail,
 
          scope:

            "https://www.googleapis.com/auth/androidpublisher",
 
          aud:

            "https://oauth2.googleapis.com/token",
 
          iat:

            getNumericDate(0),
 
          exp:

            getNumericDate(60 * 60)

        },

        key

      );
 
    return new Response(

      JSON.stringify(

        {

          success: true,

          step: "djwt-rs256",

          jwtParts:

            jwt.split(".").length,

          jwtLength:

            jwt.length,

          keyInfo,

          message:

            "RS256 JWT created successfully."

        },

        null,

        2

      ),

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

      JSON.stringify(

        {

          success: false,

          step: "djwt-rs256",

          message:

            error instanceof Error

              ? error.message

              : String(error)

        },

        null,

        2

      ),

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
 