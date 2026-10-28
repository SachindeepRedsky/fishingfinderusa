Deno.serve(async () => {
  try {
    const raw = Deno.env.get(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"
    );
 
    if (!raw) {
      throw new Error("Service account JSON missing");
    }
 
    const credentials = JSON.parse(raw);
 
    const clientEmail = credentials.client_email;
 
    if (!clientEmail) {
      throw new Error("client_email missing");
    }
 
    const now = Math.floor(Date.now() / 1000);
 
    const encoder = new TextEncoder();
 
    const bytesToBase64 = (bytes) => {
      let binary = "";
 
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(
          ...Array.from(bytes.subarray(i, i + 0x8000))
        );
      }
 
      return btoa(binary);
    };
 
    const base64Url = (value) => {
      return bytesToBase64(
        encoder.encode(value)
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    };
 
    const header = base64Url(
      JSON.stringify({
        alg: "RS256",
        typ: "JWT"
      })
    );
 
    const payload = base64Url(
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
 
    return new Response(
      JSON.stringify({
        success: true,
        step: "jwt-header-payload",
        headerLength: header.length,
        payloadLength: payload.length,
        signingInputLength: signingInput.length,
        message:
          "JWT header and payload created successfully."
      }, null, 2),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
 
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        step: "jwt-header-payload",
        message:
          error instanceof Error
            ? error.message
            : String(error)
      }, null, 2),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
});