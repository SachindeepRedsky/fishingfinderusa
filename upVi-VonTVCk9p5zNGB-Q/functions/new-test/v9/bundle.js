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
    const raw = getEnv(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"
    );
 
    if (!raw) {
      throw new Error(
        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing."
      );
    }
 
    const credentials = JSON.parse(raw);
 
    if (!credentials.private_key) {
      throw new Error(
        "private_key is missing."
      );
    }
 
    const pem =
      credentials.private_key;
 
    console.log(
      "Private key received:",
      pem.length
    );
 
    const bytes =
      pemToPkcs8Bytes(pem);
 
    console.log(
      "Private key converted:",
      bytes.length
    );
 
    return new Response(
      JSON.stringify({
        success: true,
        step: "private-key",
        pemLength: pem.length,
        pkcs8Bytes: bytes.length,
        beginsCorrectly:
          pem.includes("BEGIN PRIVATE KEY"),
        endsCorrectly:
          pem.includes("END PRIVATE KEY"),
        message:
          "Private key converted successfully."
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
        step: "private-key",
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