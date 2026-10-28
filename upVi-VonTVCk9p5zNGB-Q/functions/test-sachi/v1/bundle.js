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
 
    if (!clientEmail || !privateKeyPem) {
      throw new Error(
        "client_email or private_key missing."
      );
    }
 
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
 
      return base64ToBytes(body);
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
          iat: now,
          exp: now + 3600
        })
      );
 
    const signingInput =
      `${header}.${payload}`;
 
    const key =
      await crypto.subtle.importKey(
        "pkcs8",
        pemToPkcs8Bytes(privateKeyPem),
        {
          name:
            "RSASSA-PKCS1-v1_5",
          hash: "SHA-256"
        },
        false,
        ["sign"]
      );
 
    const signature =
      await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(
          signingInput
        )
      );
 
    const jwt =
      `${signingInput}.` +
      base64UrlFromBytes(
        new Uint8Array(signature)
      );
 
    // Decode payload only for testing.
    const payloadPart =
      jwt.split(".")[1];
 
    const decodedPayload =
      JSON.parse(
        new TextDecoder().decode(
          base64ToBytes(
            payloadPart
              .replace(/-/g, "+")
              .replace(/_/g, "/") +
            "==="
          )
        )
      );
 
    return new Response(
      JSON.stringify(
        {
          success: true,
          step: "jwt-validation",
 
          algorithm: "RS256",
 
          jwtParts:
            jwt.split(".").length,
 
          jwtLength:
            jwt.length,
 
          clientEmail:
            clientEmail,
 
          issuer:
            decodedPayload.iss,
 
          audience:
            decodedPayload.aud,
 
          scope:
            decodedPayload.scope,
 
          issuedAt:
            decodedPayload.iat,
 
          expiresAt:
            decodedPayload.exp,
 
          expiresInSeconds:
            decodedPayload.exp -
            Math.floor(
              Date.now() / 1000
            ),
 
          message:
            "JWT created and decoded successfully. Google was NOT called."
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
          step: "jwt-validation",
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