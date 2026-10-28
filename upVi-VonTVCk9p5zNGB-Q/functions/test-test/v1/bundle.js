function getEnv(key) {
  try {
    const value = Deno.env.get(key);
    return typeof value === "string" ? value.trim() : "";
  } catch (_) {
    return "";
  }
}
 
function bytesToBase64(bytes) {
  let binary = "";
 
  const chunk = 0x8000;
 
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...Array.from(bytes.subarray(i, i + chunk))
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
  const startedAt = Date.now();
 
  try {
    console.log("STEP 1: Function started");
 
    // -----------------------------------------
    // Environment
    // -----------------------------------------
 
    const raw = getEnv(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"
    );
 
    if (!raw) {
      throw new Error(
        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing."
      );
    }
 
    console.log(
      "STEP 2: Service account loaded"
    );
 
    // -----------------------------------------
    // JSON
    // -----------------------------------------
 
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
 
    console.log(
      "STEP 3: Credentials validated"
    );
 
    // -----------------------------------------
    // JWT Header
    // -----------------------------------------
 
    const now =
      Math.floor(Date.now() / 1000);
 
    const header =
      base64UrlFromString(
        JSON.stringify({
          alg: "RS256",
          typ: "JWT"
        })
      );
 
    console.log(
      "STEP 4: JWT header created"
    );
 
    // -----------------------------------------
    // JWT Payload
    // -----------------------------------------
 
    const payload =
      base64UrlFromString(
        JSON.stringify({
          iss: clientEmail,
 
          scope:
            "https://www.googleapis.com/auth/androidpublisher",
 
          aud:
            "https://oauth2.googleapis.com/token",
 
          exp: now + 3600,
 
          iat: now
        })
      );
 
    console.log(
      "STEP 5: JWT payload created"
    );
 
    const signingInput =
      `${header}.${payload}`;
 
    // -----------------------------------------
    // Import private key
    // -----------------------------------------
 
    const key =
      await crypto.subtle.importKey(
        "pkcs8",
        pemToPkcs8Bytes(
          privateKeyPem
        ),
        {
          name:
            "RSASSA-PKCS1-v1_5",
          hash: "SHA-256"
        },
        false,
        ["sign"]
      );
 
    console.log(
      "STEP 6: Private key imported"
    );
 
    // -----------------------------------------
    // Sign JWT
    // -----------------------------------------
 
    const signature =
      await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(
          signingInput
        )
      );
 
    console.log(
      "STEP 7: JWT signed"
    );
 
    const jwt =
      `${signingInput}.` +
      base64UrlFromBytes(
        new Uint8Array(signature)
      );
 
    console.log(
      "STEP 8: JWT created",
      {
        jwtLength: jwt.length
      }
    );
 
    // -----------------------------------------
    // Google OAuth
    // -----------------------------------------
 
    console.log(
      "STEP 9: Calling Google OAuth..."
    );
 
    const controller =
      new AbortController();
 
    const timeout =
      setTimeout(() => {
        console.log(
          "STEP 10: Google request timeout"
        );
 
        controller.abort();
      }, 15000);
 
    let response;
 
    try {
      response =
        await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
 
            signal: controller.signal,
 
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },
 
            body:
              new URLSearchParams({
                grant_type:
                  "urn:ietf:params:oauth:grant-type:jwt-bearer",
 
                assertion: jwt
              })
          }
        );
    } catch (error) {
      clearTimeout(timeout);
 
      return new Response(
        JSON.stringify(
          {
            success: false,
 
            step:
              "google-oauth-network",
 
            message:
              error instanceof Error
                ? error.message
                : String(error),
 
            elapsedMs:
              Date.now() -
              startedAt
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
 
    clearTimeout(timeout);
 
    console.log(
      "STEP 10: Google response received",
      {
        status: response.status
      }
    );
 
    // -----------------------------------------
    // Google response
    // -----------------------------------------
 
    const text =
      await response.text();
 
    let data = {};
 
    try {
      data =
        text ? JSON.parse(text) : {};
    } catch (_) {
      data = {
        raw: text
      };
    }
 
    if (!response.ok) {
      return new Response(
        JSON.stringify(
          {
            success: false,
 
            step:
              "google-oauth-response",
 
            httpStatus:
              response.status,
 
            error:
              data.error || null,
 
            errorDescription:
              data.error_description ||
              null,
 
            elapsedMs:
              Date.now() -
              startedAt
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
 
          expiresIn:
            data.expires_in ||
            null,
 
          tokenType:
            data.token_type ||
            null,
 
          elapsedMs:
            Date.now() -
            startedAt,
 
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
      "Google OAuth test error:",
      error
    );
 
    return new Response(
      JSON.stringify(
        {
          success: false,
 
          step:
            "google-oauth-token",
 
          message:
            error instanceof Error
              ? error.message
              : String(error),
 
          elapsedMs:
            Date.now() -
            startedAt
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