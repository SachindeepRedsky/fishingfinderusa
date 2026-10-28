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
      ...Array.from(
        bytes.subarray(i, i + chunk)
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
 
    const credentials =
      JSON.parse(raw);
 
    const clientEmail =
      credentials.client_email;
 
    if (!clientEmail) {
      throw new Error(
        "client_email is missing."
      );
    }
 
    const now =
      Math.floor(Date.now() / 1000);
 
    const header =
      base64UrlFromString(
        JSON.stringify({
          alg: "RS256",
          typ: "JWT"
        })
      );
 
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
 
    const signingInput =
      `${header}.${payload}`;
 
    return new Response(
      JSON.stringify({
        success: true,
        step: "jwt-creation",
 
        headerCreated: !!header,
        payloadCreated: !!payload,
        signingInputCreated:
          !!signingInput,
 
        headerLength:
          header.length,
 
        payloadLength:
          payload.length,
 
        signingInputLength:
          signingInput.length,
 
        message:
          "JWT header and payload created successfully."
      }, null, 2),
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
        step: "jwt-creation",
        message: error instanceof Error
          ? error.message
          : String(error)
      }, null, 2),
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