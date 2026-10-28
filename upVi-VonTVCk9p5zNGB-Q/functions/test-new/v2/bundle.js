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
 
  const bytes = new Uint8Array(
    binary.length
  );
 
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
 
  if (!body) {
    throw new Error(
      "Private key body is empty."
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

 
    const credentials =
      JSON.parse(raw);
 
    const privateKeyPem =
      credentials.private_key;
 
    if (!privateKeyPem) {
      throw new Error(
        "private_key missing."
      );
    }
 
    const bytes =
      pemToPkcs8Bytes(
        privateKeyPem
      );

    const key =
      await crypto.subtle.importKey(
        "pkcs8",
        bytes,
        {
          name:
            "RSASSA-PKCS1-v1_5",
          hash: "SHA-256"
        },
        false,
        ["sign"]
      );
 
    console.log(
      "STEP 7: importKey successful"
    );
 
    return new Response(
      JSON.stringify({
        success: true,
        step: "crypto-import",
        keyImported: !!key,
        message:
          "Web Crypto importKey is working."
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
    console.error(
      "Crypto import error:",
      error
    );
 
    return new Response(
      JSON.stringify({
        success: false,
        step: "crypto-import",
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