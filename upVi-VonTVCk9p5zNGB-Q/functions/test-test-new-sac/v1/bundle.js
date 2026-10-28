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
    console.log("STEP 1: Loading credentials");
 
    const raw = getEnv(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"
    );
 
    if (!raw) {
      throw new Error(
        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing."
      );
    }
 
    const credentials = JSON.parse(raw);
 
    const privateKeyPem =
      credentials.private_key;
 
    if (!privateKeyPem) {
      throw new Error(
        "private_key is missing."
      );
    }
 
    console.log(
      "STEP 2: Converting private key"
    );
 
    const privateKeyBytes =
      pemToPkcs8Bytes(
        privateKeyPem
      );
 
    console.log(
      "STEP 3: Importing private key"
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
      "STEP 4: Private key imported"
    );
 
    return new Response(
      JSON.stringify(
        {
          success: true,
          step: "crypto-import-key",
          privateKeyBytes:
            privateKeyBytes.length,
          keyImported:
            !!key,
          message:
            "Web Crypto importKey is working."
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
      "ImportKey error:",
      error
    );
 
    return new Response(
      JSON.stringify(
        {
          success: false,
          step: "crypto-import-key",
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