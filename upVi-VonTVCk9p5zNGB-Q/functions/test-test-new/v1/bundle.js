Deno.serve(async () => {
  const started = Date.now();
 
  try {
    console.log("STEP 1: Starting external fetch");
 
    const controller = new AbortController();
 
    const timeout = setTimeout(() => {
      console.log("STEP 2: Request timeout");
      controller.abort();
    }, 10000);
 
    let response;
 
    try {
      response = await fetch(
        "https://www.google.com",
        {
          method: "GET",
          signal: controller.signal,
        }
      );
    } catch (error) {
      clearTimeout(timeout);
 
      return new Response(
        JSON.stringify({
          success: false,
          step: "external-fetch",
          message:
            error instanceof Error
              ? error.message
              : String(error),
          elapsedMs: Date.now() - started,
        }, null, 2),
        {
          status: 500,
          headers: {
            "Content-Type":
              "application/json",
          },
        }
      );
    }
 
    clearTimeout(timeout);
 
    console.log(
      "STEP 3: Response received",
      response.status
    );
 
    return new Response(
      JSON.stringify({
        success: true,
        step: "external-fetch",
        httpStatus: response.status,
        elapsedMs: Date.now() - started,
        message:
          "External HTTPS request is working.",
      }, null, 2),
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
 
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        step: "external-fetch",
        message:
          error instanceof Error
            ? error.message
            : String(error),
      }, null, 2),
      {
        status: 500,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  }
});