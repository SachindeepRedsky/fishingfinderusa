Deno.serve(async () => {
  try {
    const result = {
      cryptoExists:
        typeof crypto !== "undefined",
 
      subtleExists:
        typeof crypto?.subtle !== "undefined",
 
      signType:
        typeof crypto?.subtle?.sign,
 
      importKeyType:
        typeof crypto?.subtle?.importKey,
 
      generateKeyType:
        typeof crypto?.subtle?.generateKey,
 
      digestType:
        typeof crypto?.subtle?.digest
    };
 
    return new Response(
      JSON.stringify({
        success: true,
        step: "web-crypto-capabilities",
        ...result
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
        step: "web-crypto-capabilities",
        message:
          error instanceof Error
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