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
 
function hexToBase64Url(hex) {
  let binary = "";
 
  for (let i = 0; i < hex.length; i += 2) {
    binary += String.fromCharCode(
      parseInt(hex.substr(i, 2), 16)
    );
  }
 
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
 
Deno.serve(async () => {
  const started = Date.now();
 
  try {
 
    // =====================================
    // STEP 1 — Read credentials
    // =====================================
 
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
 
    // =====================================
    // STEP 2 — JWT header
    // =====================================
 
    const header = {
      alg: "RS256",
      typ: "JWT"
    };
 
    // =====================================
    // STEP 3 — JWT payload
    // =====================================
 
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
 
    // =====================================
    // STEP 4 — RSA private key
    // =====================================
 
    const privateKey =
      KEYUTIL.getKey(
        privateKeyPem
      );
 
    // =====================================
    // STEP 5 — RS256 signature
    // =====================================
 
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
 
    const encodedSignature =
      hexToBase64Url(
        signatureHex
      );
 
    // =====================================
    // STEP 6 — Final JWT
    // =====================================
 
    const jwt =
      `${signingInput}.${encodedSignature}`;
 
    console.log(
      "JWT generated:",
      jwt.length
    );
 
    // =====================================
    // STEP 7 — Google OAuth
    // =====================================
 
    const response =
      await fetch(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
 
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded"
          },
 
          body:
            `grant_type=${encodeURIComponent(
              "urn:ietf:params:oauth:grant-type:jwt-bearer"
            )}` +
            `&assertion=${encodeURIComponent(
              jwt
            )}`
        }
      );
 
    // =====================================
    // STEP 8 — Google response
    // =====================================
 
    const data =
      await response.json()
        .catch(() => ({}));
 
    if (!response.ok) {
 
      return new Response(
        JSON.stringify(
          {
            success: false,
 
            step:
              "google-oauth-token",
 
            httpStatus:
              response.status,
 
            googleError:
              data.error || null,
 
            googleErrorDescription:
              data.error_description ||
              null,
 
            elapsedMs:
              Date.now() - started
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
    }
 
    return new Response(
      JSON.stringify(
        {
          success: true,
 
          step:
            "google-oauth-token",
 
          httpStatus:
            response.status,
 
          tokenReceived:
            !!data.access_token,
 
          tokenType:
            data.token_type || null,
 
          expiresIn:
            data.expires_in || null,
 
          elapsedMs:
            Date.now() - started,
 
          message:
            "Google OAuth access token generated successfully."
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
      "Google OAuth error:",
      error
    );
 
    return new Response(
      JSON.stringify(
        {
          success: false,
 
          step:
            "google-oauth-token",
 
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