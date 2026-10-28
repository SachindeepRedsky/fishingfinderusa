export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(s);
}

function b64url(bytes) {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlStr(v) {
  return b64url(new TextEncoder().encode(v));
}

function pemBytes(pem) {
  const body = String(pem)
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const t0 = Date.now();
  const steps = [];
  const out = { ok: true };

  const push = (name) => steps.push(`${name} @${Date.now() - t0}ms`);

  try {
    const body = await req.json().catch(() => ({}));
    push("body-parsed");

    const raw = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") || "";
    out.hasServiceAccount = !!raw;
    out.serviceAccountChars = raw.length;
    push("env-read");

    if (!raw) {
      out.ok = false;
      out.error = "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing";
      out.steps = steps;
      return new Response(JSON.stringify(out), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    let creds;
    try {
      creds = JSON.parse(raw);
    } catch (_) {
      creds = JSON.parse(atob(raw));
    }
    out.clientEmail = creds.client_email || null;
    out.projectId = creds.project_id || null;
    out.privateKeyChars = creds.private_key ? String(creds.private_key).length : 0;
    push("credentials-parsed");

    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemBytes(creds.private_key),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
    push("key-imported");

    const now = Math.floor(Date.now() / 1000);
    const input =
      b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." +
      b64urlStr(JSON.stringify({
        iss: creds.client_email,
        scope: "https://www.googleapis.com/auth/androidpublisher",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600
      }));

    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(input)
    );
    const jwt = `${input}.${b64url(new Uint8Array(sig))}`;
    out.jwtChars = jwt.length;
    push("jwt-signed");

    if (body && body.fetch) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const started = Date.now();

      try {
        const r = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt
          }).toString(),
          signal: controller.signal
        });

        const text = await r.text();
        out.oauthStatus = r.status;
        out.oauthMs = Date.now() - started;
        out.oauthBody = text.slice(0, 300);
      } catch (e) {
        out.oauthError = e instanceof Error ? e.message : String(e);
        out.oauthMs = Date.now() - started;
      } finally {
        clearTimeout(timer);
      }

      push("oauth-fetch-done");
    }

    out.totalMs = Date.now() - t0;
    out.steps = steps;

    return new Response(JSON.stringify(out), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      steps,
      totalMs: Date.now() - t0
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
});
