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
 
function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
 
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
 
  return bytes;
}
 
function pemToPkcs8Bytes(pem) {
  const body = String(pem)
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
 
  if (!body) {
    throw new Error("Private key body is empty.");
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
        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing."
      );
    }
 
    const credentials = JSON.parse(raw);
 
    const privateKeyBytes =
      pemToPkcs8Bytes(
        credentials.private_key
      );
 
    // IMPORTANT:
    // Import the key with the exact algorithm
    // parameters used by RS256.
 
    const key =
      await crypto.subtle.importKey(
        "pkcs8",
        privateKeyBytes,
        {
          name: "RSASSA-PKCS1-v1_5",
          hash: {
            name: "SHA-256"
          }
        },
        false,
        ["sign"]
      );
 
    return new Response(
      JSON.stringify(
        {
          success: true,
          step: "rsa-key-info",
 
          keyType:
            key.type,
 
          algorithmName:
            key.algorithm?.name || null,
 
          hashName:
            key.algorithm?.hash?.name || null,
 
          usages:
            key.usages,
 
          extractable:
            key.extractable,
 
          message:
            "RSA private key imported successfully."
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
          step: "rsa-key-info",
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