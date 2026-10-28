function getEnv(key) {
  try {
    const value = Deno.env.get(key);
    return typeof value === "string" ? value.trim() : "";
  } catch (_) {
    return "";
  }
}
 
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
 
function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
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
      "Google private key is empty or malformed."
    );
  }
 
  return base64ToBytes(body);
}
 
Deno.serve(async () => {
  try {
    const raw = getEnv(
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
 
    if (!clientEmail || !privateKeyPem) {
      throw new Error(
        "client_email or private_key missing."
      );
    }
 
    const now = Math.floor(Date.now() / 1000);
 
    const header = base64UrlFromString(
      JSON.stringify({
        alg: "RS256",
        typ: "JWT",
      })
    );
 
    const payload = base64UrlFromString(
      JSON.stringify({
        iss: clientEmail,
        scope:
          "https://www.googleapis.com/auth/androidpublisher",
        aud:
          "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
      })
    );
 
    const signingInput = `${header}.${payload}`;
 
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8Bytes(privateKeyPem),
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );
 
    const signatureBuffer =
      await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(signingInput)
      );
 
    const jwt =
      `${signingInput}.` +
      base64UrlFromBytes(
        new Uint8Array(signatureBuffer)
      );
 
    const response = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type:
            "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        }),
      }
    );
 
    const data = await response.json().catch(() => ({}));
 
    if (!response.ok) {
      return json(
        {
          success: false,
          step: "google-oauth-token",
          httpStatus: response.status,
          error: data.error,
          errorDescription:
            data.error_description,
        },
        500
      );
    }
 
    return json({
      success: true,
      step: "google-oauth-token",
      httpStatus: response.status,
      tokenReceived: !!data.access_token,
      expiresIn: data.expires_in || null,
      message:
        "Google OAuth access token generated successfully.",
    });
  } catch (error) {
    return json(
      {
        success: false,
        step: "google-oauth-token",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});