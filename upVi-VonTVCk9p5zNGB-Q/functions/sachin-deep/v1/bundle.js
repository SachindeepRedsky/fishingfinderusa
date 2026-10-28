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

    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "")

    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, "")

    .replace(/\s+/g, "");
 
  return base64ToBytes(body);

}
 
Deno.serve(async () => {

  const started = Date.now();
 
  try {

    console.log("1. Loading credentials");
 
    const raw = getEnv(

      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"

    );
 
    if (!raw) {

      throw new Error("Service account JSON missing");

    }
 
    const credentials = JSON.parse(raw);
 
    console.log("2. Converting private key");
 
    const privateKeyBytes =

      pemToPkcs8Bytes(

        credentials.private_key

      );
 
    console.log(

      "3. Private key bytes:",

      privateKeyBytes.length

    );
 
    console.log("4. Importing key");
 
    const key =

      await crypto.subtle.importKey(

        "pkcs8",

        privateKeyBytes,

        {

          name: "RSASSA-PKCS1-v1_5",

          hash: "SHA-256"

        },

        false,

        ["sign"]

      );
 
    console.log("5. Key imported");
 
    const data =

      new TextEncoder().encode(

        "google-play-jwt-test"

      );
 
    console.log("6. BEFORE sign");
 
    const signPromise =

      crypto.subtle.sign(

        {

          name: "RSASSA-PKCS1-v1_5"

        },

        key,

        data

      );
 
    const timeoutPromise =

      new Promise((_, reject) => {

        setTimeout(() => {

          reject(

            new Error(

              "crypto.subtle.sign() did not complete within 5000ms"

            )

          );

        }, 5000);

      });
 
    const signature =

      await Promise.race([

        signPromise,

        timeoutPromise

      ]);
 
    console.log("7. AFTER sign");
 
    return new Response(

      JSON.stringify(

        {

          success: true,

          step: "crypto-sign-timeout-test",

          signatureBytes:

            signature.byteLength,

          elapsedMs:

            Date.now() - started,

          message:

            "crypto.subtle.sign() completed successfully."

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

      "SIGN TEST ERROR:",

      error

    );
 
    return new Response(

      JSON.stringify(

        {

          success: false,

          step: "crypto-sign-timeout-test",

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
 