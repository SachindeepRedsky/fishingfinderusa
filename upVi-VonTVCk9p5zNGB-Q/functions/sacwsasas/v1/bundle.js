import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
 
function getEnv(key) {

  try {

    const value = Deno.env.get(key);

    return typeof value === "string" ? value.trim() : "";

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

  const normalized = String(pem)

    .replace(/\\n/g, "\n")

    .trim();
 
  const body = normalized

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

  const started = Date.now();
 
  try {

    console.log("STEP 1: Reading service account");
 
    const raw = getEnv(

      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"

    );
 
    if (!raw) {

      throw new Error(

        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing."

      );

    }
 
    const credentials = JSON.parse(raw);
 
    const clientEmail =

      credentials.client_email;
 
    const privateKeyPem =

      credentials.private_key;
 
    if (!clientEmail) {

      throw new Error(

        "client_email is missing."

      );

    }
 
    if (!privateKeyPem) {

      throw new Error(

        "private_key is missing."

      );

    }
 
    console.log(

      "STEP 2: Converting private key"

    );
 
    const privateKeyBytes =

      pemToPkcs8Bytes(

        privateKeyPem

      );
 
    console.log(

      "Private key bytes:",

      privateKeyBytes.length

    );
 
    console.log(

      "STEP 3: Importing RSA key"

    );
 
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
 
    console.log(

      "STEP 4: Creating JWT with djwt"

    );
 
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

          iat: getNumericDate(0),

          exp: getNumericDate(60 * 60)

        },

        key

      );
 
    console.log(

      "STEP 5: JWT created"

    );
 
    const parts =

      jwt.split(".");
 
    return new Response(

      JSON.stringify(

        {

          success: true,
 
          step: "djwt-sign",
 
          jwtParts:

            parts.length,
 
          jwtLength:

            jwt.length,
 
          headerLength:

            parts[0]?.length || 0,
 
          payloadLength:

            parts[1]?.length || 0,
 
          signatureLength:

            parts[2]?.length || 0,
 
          elapsedMs:

            Date.now() - started,
 
          message:

            "JWT successfully created using djwt. Google was NOT called."

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
 
    console.error(

      "djwt sign error:",

      error

    );
 
    return new Response(

      JSON.stringify(

        {

          success: false,
 
          step: "djwt-sign",
 
          elapsedMs:

            Date.now() - started,
 
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
 