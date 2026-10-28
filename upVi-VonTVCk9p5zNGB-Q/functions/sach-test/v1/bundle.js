Deno.serve(async () => {

  try {

    const raw = Deno.env.get(

      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"

    );
 
    if (!raw) {

      throw new Error(

        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing."

      );

    }
 
    const credentials = JSON.parse(raw);
 
    const clientEmail = credentials.client_email;

    const privateKeyPem = credentials.private_key;
 
    if (!clientEmail) {

      throw new Error("client_email is missing.");

    }
 
    if (!privateKeyPem) {

      throw new Error("private_key is missing.");

    }
 
    // --------------------------------

    // Helpers

    // --------------------------------
 
    function bytesToBase64(bytes) {

      let binary = "";
 
      for (

        let i = 0;

        i < bytes.length;

        i += 0x8000

      ) {

        binary += String.fromCharCode(

          ...Array.from(

            bytes.subarray(i, i + 0x8000)

          )

        );

      }
 
      return btoa(binary);

    }
 
    function base64UrlFromBytes(bytes) {

      return bytesToBase64(bytes)

        .replace(/\+/g, "-")

        .replace(/\//g, "_")

        .replace(/=+$/, "");

    }
 
    function base64UrlFromString(input) {

      return base64UrlFromBytes(

        new TextEncoder().encode(input)

      );

    }
 
    function base64ToBytes(b64) {

      const binary = atob(b64);
 
      const bytes =

        new Uint8Array(binary.length);
 
      for (

        let i = 0;

        i < binary.length;

        i++

      ) {

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
 
    // --------------------------------

    // JWT Header

    // --------------------------------
 
    const now =

      Math.floor(Date.now() / 1000);
 
    const header =

      base64UrlFromString(

        JSON.stringify({

          alg: "RS256",

          typ: "JWT"

        })

      );
 
    // --------------------------------

    // JWT Payload

    // --------------------------------
 
    const payload =

      base64UrlFromString(

        JSON.stringify({

          iss: clientEmail,
 
          scope:

            "https://www.googleapis.com/auth/androidpublisher",
 
          aud:

            "https://oauth2.googleapis.com/token",
 
          iat: now,
 
          exp: now + 3600

        })

      );
 
    const signingInput =

      `${header}.${payload}`;
 
    console.log(

      "STEP 1: Signing input created"

    );
 
    // --------------------------------

    // Import Private Key

    // --------------------------------
 
    const privateKeyBytes =

      pemToPkcs8Bytes(

        privateKeyPem

      );
 
    console.log(

      "STEP 2: Private key converted",

      privateKeyBytes.length

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

      "STEP 3: Private key imported"

    );
 
    // --------------------------------

    // Sign

    // --------------------------------
 
    const signatureBuffer =

      await crypto.subtle.sign(

        "RSASSA-PKCS1-v1_5",

        key,

        new TextEncoder().encode(

          signingInput

        )

      );
 
    console.log(

      "STEP 4: Signature created"

    );
 
    const signature =

      base64UrlFromBytes(

        new Uint8Array(

          signatureBuffer

        )

      );
 
    const jwt =

      `${signingInput}.${signature}`;
 
    // --------------------------------

    // Final validation

    // --------------------------------
 
    const parts =

      jwt.split(".");
 
    return new Response(

      JSON.stringify(

        {

          success: true,
 
          step: "jwt-sign",
 
          signatureBytes:

            signatureBuffer.byteLength,
 
          signatureLength:

            signature.length,
 
          jwtParts:

            parts.length,
 
          jwtLength:

            jwt.length,
 
          headerLength:

            header.length,
 
          payloadLength:

            payload.length,
 
          message:

            "JWT was successfully created and signed. Google was NOT called."

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

      "JWT sign error:",

      error

    );
 
    return new Response(

      JSON.stringify(

        {

          success: false,
 
          step: "jwt-sign",
 
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
 