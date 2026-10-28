Deno.serve(async () => {
  const started = Date.now();
 
  try {
    console.log("STEP 1: Starting OAuth POST test");
 
    const response = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
 
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
 
        body: new URLSearchParams({
          grant_type:
            "urn:ietf:params:oauth:grant-type:jwt-bearer",
 
          assertion: "TEST_ASSERTION"
        })
      }
    );
 
    console.log(
      "STEP 2: Google OAuth response",
      response.status
    );
 
    const text = await response.text();
 
    console.log(
      "STEP 3: Response body received"
    );
 
    let data = {};
 
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = {
        raw: text
      };
    }
 
    return new Response(
      JSON.stringify(
        {
          success: true,
 
          step:
            "google-oauth-post",
 
          httpStatus:
            response.status,
 
          elapsedMs:
            Date.now() - started,
 
          googleResponse:
            data,
 
          message:
            "Google OAuth POST endpoint is reachable."
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
      "OAuth POST error:",
      error
    );
 
    return new Response(
      JSON.stringify(
        {
          success: false,
 
          step:
            "google-oauth-post",
 
          message:
            error instanceof Error
              ? error.message
              : String(error),
 
          elapsedMs:
            Date.now() - started
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