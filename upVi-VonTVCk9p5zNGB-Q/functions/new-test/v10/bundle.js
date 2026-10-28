import {
  KJUR,
  KEYUTIL
} from "https://esm.sh/jsrsasign@11.1.0";
 
function getEnv(key) {
  try {
    return Deno.env.get(key)?.trim() || "";
  } catch (_) {
    return "";
  }
}
 
function base64UrlEncode(input) {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
 
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
 
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
 
function hexToBase64Url(hex) {
  let binary = "";
 
  for (let i = 0; i < hex.length; i += 2) {
    binary += String.fromCharCode(
      parseInt(hex.substr(i, 2), 16)
    );
  }
 
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
 
async function getGoogleAccessToken() {
 
  const raw =
    getEnv(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"
    );
 
  if (!raw) {
    throw new Error(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing."
    );
  }
 
  const credentials =
    JSON.parse(raw);
 
  const clientEmail =
    credentials.client_email;
 
  const privateKeyPem =
    credentials.private_key;
 
  const now =
    Math.floor(Date.now() / 1000);
 
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
 
  const payload = {
    iss: clientEmail,
 
    scope:
      "https://www.googleapis.com/auth/androidpublisher",
 
    aud:
      "https://oauth2.googleapis.com/token",
 
    iat: now,
 
    exp: now + 3600
  };
 
  const encodedHeader =
    base64UrlEncode(
      JSON.stringify(header)
    );
 
  const encodedPayload =
    base64UrlEncode(
      JSON.stringify(payload)
    );
 
  const signingInput =
    `${encodedHeader}.${encodedPayload}`;
 
  const privateKey =
    KEYUTIL.getKey(
      privateKeyPem
    );
 
  const signature =
    new KJUR.crypto.Signature({
      alg: "SHA256withRSA"
    });
 
  signature.init(privateKey);
 
  signature.updateString(
    signingInput
  );
 
  const signatureHex =
    signature.sign();
 
  const encodedSignature =
    hexToBase64Url(
      signatureHex
    );
 
  const jwt =
    `${signingInput}.${encodedSignature}`;
 
  const response =
    await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
 
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
 
        body:
          `grant_type=${encodeURIComponent(
            "urn:ietf:params:oauth:grant-type:jwt-bearer"
          )}` +
          `&assertion=${encodeURIComponent(
            jwt
          )}`
      }
    );
 
  const data =
    await response.json()
      .catch(() => ({}));
 
  if (!response.ok) {
    throw new Error(
      data.error_description ||
      data.error ||
      "Google OAuth failed."
    );
  }
 
  return data.access_token;
}
 
Deno.serve(async () => {
 
  try {
 
    const accessToken =
      await getGoogleAccessToken();
 
    const packageName =
      getEnv(
        "GOOGLE_PLAY_PACKAGE_NAME"
      ) ||
      "com.fishingfinderusa";
 
    // Fake values intentionally used.
    // We only want to test Google Play API connectivity.
 
    const fakeProductId =
      "test-product";
 
    const fakePurchaseToken =
      "test-token";
 
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${encodeURIComponent(packageName)}` +
      `/purchases/subscriptions/` +
      `${encodeURIComponent(fakeProductId)}` +
      `/tokens/` +
      `${encodeURIComponent(fakePurchaseToken)}`;
 
    console.log(
      "Calling Google Play API"
    );
 
    const response =
      await fetch(
        url,
        {
          method: "GET",
 
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
 
            "Content-Type":
              "application/json"
          }
        }
      );
 
    const text =
      await response.text();
 
    let data;
 
    try {
      data =
        text
          ? JSON.parse(text)
          : {};
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
            "google-play-api",
 
          httpStatus:
            response.status,
 
          googleResponse:
            data,
 
          message:
            "Google Play API endpoint was reached successfully."
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
 
          step:
            "google-play-api",
 
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