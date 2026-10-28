import {
  KJUR,
  KEYUTIL
} from "https://esm.sh/jsrsasign@11.1.0";
 
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
 
function base64UrlEncode(input) {
  const bytes =
    new TextEncoder().encode(input);
 
  let binary = "";
 
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
 
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
 
Deno.serve(async () => {
  const started = Date.now();
 
  try {
    // --------------------------------
    // 1. Read Google service account
    // --------------------------------
 
    const raw =
      getEnv(
        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"
      );
 
    if (!raw) {
      throw new Error(
        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing."
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
        "client_email is missing."
      );
    }
 
    if (!privateKeyPem) {
      throw new Error(
        "private_key is missing."
      );
    }
 
    // --------------------------------
    // 2. Create JWT header
    // --------------------------------
 
    const header = {
      alg: "RS256",
      typ: "JWT"
    };
 
    // --------------------------------
    // 3. Create JWT payload
    // --------------------------------
 
    const now =
      Math.floor(Date.now() / 1000);
 
    const payload = {
      iss: clientEmail,
 
      scope:
        "https://www.googleapis.com/auth/androidpublisher",
 
      aud:
        "https://oauth2.googleapis.com/token",
 
      iat: now,
 
      exp: now + 3600
    };
 
    const encodedHeader =
      base64UrlEncode(
        JSON.stringify(header)
      );
 
    const encodedPayload =
      base64UrlEncode(
        JSON.stringify(payload)
      );
 
    const signingInput =
      `${encodedHeader}.${encodedPayload}`;
 
    // --------------------------------
    // 4. Parse Google private key
    // --------------------------------
 
    console.log(
      "STEP 4: Parsing Google private key"
    );
 
    const privateKey =
      KEYUTIL.getKey(privateKeyPem);
 
    // --------------------------------
    // 5. Create RS256 signature
    // --------------------------------
 
    console.log(
      "STEP 5: Creating RS256 signature"
    );
 
    const signature =
      new KJUR.crypto.Signature({
        alg: "SHA256withRSA"
      });
 
    signature.init(privateKey);
 
    signature.updateString(
      signingInput
    );
 
    const signatureHex =
      signature.sign();
 
    // --------------------------------
    // 6. Convert HEX → Base64URL
    // --------------------------------
 
    function hexToBase64Url(hex) {
      let binary = "";
 
      for (
        let i = 0;
        i < hex.length;
        i += 2
      ) {
        binary += String.fromCharCode(
          parseInt(
            hex.substr(i, 2),
            16
          )
        );
      }
 
      return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    }
 
    const encodedSignature =
      hexToBase64Url(
        signatureHex
      );
 
    // --------------------------------
    // 7. Final JWT
    // --------------------------------
 
    const jwt =
      `${signingInput}.${encodedSignature}`;
 
    return new Response(
      JSON.stringify(
        {
          success: true,
 
          step: "pure-js-rs256",
 
          headerLength:
            encodedHeader.length,
 
          payloadLength:
            encodedPayload.length,
 
          signatureLength:
            encodedSignature.length,
 
          jwtParts:
            jwt.split(".").length,
 
          jwtLength:
            jwt.length,
 
          elapsedMs:
            Date.now() - started,
 
          message:
            "RS256 JWT created successfully using pure JavaScript."
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
      "Pure JS RS256 error:",
      error
    );
 
    return new Response(
      JSON.stringify(
        {
          success: false,
 
          step: "pure-js-rs256",
 
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