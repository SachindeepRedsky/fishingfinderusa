Deno.serve(async () => {
  const started = Date.now();
 
  try {
    console.log("STEP 1: Starting external fetch");
 
    const response = await fetch(
      "https://www.google.com"
    );
 
    console.log(
      "STEP 2: Response received",
      response.status
    );
 
    return new Response(
      JSON.stringify({
        success: true,
        step: "external-fetch",
        httpStatus: response.status,
        elapsedMs: Date.now() - started,
        message:
          "External HTTPS request is working."
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
      "External fetch error:",
      error
    );
 
    return new Response(
      JSON.stringify({
        success: false,
        step: "external-fetch",
        message:
          error instanceof Error
            ? error.message
            : String(error),
        elapsedMs:
          Date.now() - started
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