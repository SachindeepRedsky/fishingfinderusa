Deno.serve(async () => {
  const started = Date.now();
 
  try {
    console.log("STEP 1: Generating RSA key");
 
    const keyPair =
      await crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength: 2048,
          publicExponent: new Uint8Array([
            1, 0, 1
          ]),
          hash: "SHA-256"
        },
        false,
        ["sign", "verify"]
      );
 
    console.log("STEP 2: RSA key generated");
 
    console.log(
      "Private key type:",
      keyPair.privateKey.type
    );
 
    console.log(
      "Private key algorithm:",
      keyPair.privateKey.algorithm
    );
 
    const message =
      new TextEncoder().encode(
        "google-play-test"
      );
 
    console.log("STEP 3: Signing");
 
    const signature =
      await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        keyPair.privateKey,
        message
      );
 
    console.log("STEP 4: Signature created");
 
    return new Response(
      JSON.stringify(
        {
          success: true,
          step: "generated-rsa-sign",
 
          privateKeyType:
            keyPair.privateKey.type,
 
          publicKeyType:
            keyPair.publicKey.type,
 
          signatureBytes:
            signature.byteLength,
 
          elapsedMs:
            Date.now() - started,
 
          message:
            "Generated RSA key signing works."
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
      "Generated RSA sign error:",
      error
    );
 
    return new Response(
      JSON.stringify(
        {
          success: false,
          step: "generated-rsa-sign",
 
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