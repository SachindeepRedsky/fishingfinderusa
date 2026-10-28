Deno.serve(async () => {
  const started = Date.now();
 
  try {
    console.log("STEP 1: Starting Google OAuth host test");
 
    const response = await fetch(
      "https://oauth2.googleapis.com"
    );
 
    console.log(
      "STEP 2: Google OAuth host responded",
      response.status
    );
 
    const text = await response.text();
 
    return new Response(
      JSON.stringify({
        success: true,
        step: "google-oauth-host",
        httpStatus: response.status,
        elapsedMs: Date.now() - started,
        responsePreview: text.substring(0, 200),
        message:
          "oauth2.googleapis.com is reachable."
      }, null, 2),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
 
  } catch (error) {
    console.error(
      "Google OAuth host error:",
      error
    );
 
    return new Response(
      JSON.stringify({
        success: false,
        step: "google-oauth-host",
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