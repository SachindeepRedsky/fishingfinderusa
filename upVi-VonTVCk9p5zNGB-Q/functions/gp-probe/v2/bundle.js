export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
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

function reply(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const t0 = Date.now();
  const out = { ok: true, stageReached: 0 };

  try {
    const body = await req.json().catch(() => ({}));
    const stage = Number((body && body.stage) || 1);
    out.requestedStage = stage;

    // STAGE 1 - env read
    const raw = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") || "";
    out.hasServiceAccount = !!raw;
    out.serviceAccountChars = raw.length;
    out.startsWith = raw.slice(0, 12);
    out.stageReached = 1;
    if (stage <= 1) { out.totalMs = Date.now() - t0; return reply(out); }

    // STAGE 2 - parse credentials
    let creds;
    try {
      creds = JSON.parse(raw);
    } catch (_) {
      creds = JSON.parse(atob(raw));
    }
    out.clientEmail = creds.client_email || null;
    out.projectId = creds.project_id || null;
    out.privateKeyChars = creds.private_key ? String(creds.private_key).length : 0;
    out.privateKeyHeader = creds.private_key ? String(creds.private_key).slice(0, 30) : null;
    out.stageReached = 2;
    if (stage <= 2) { out.totalMs = Date.now() - t0; return reply(out); }

    // STAGE 3 - decode PEM
    const keyBytes = pemBytes(creds.private_key);
    out.pkcs8Bytes = keyBytes.length;
    out.stageReached = 3;
    if (stage <= 3) { out.totalMs = Date.now() - t0; return reply(out); }

    // STAGE 4 - import key
    const key = await crypto.subtle.importKey(
      "pkcs8",
      keyBytes,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
    out.keyImported = true;
    out.stageReached = 4;
    if (stage <= 4) { out.totalMs = Date.now() - t0; return reply(out); }

    // STAGE 5 - sign JWT
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
    out.stageReached = 5;
    if (stage <= 5) { out.totalMs = Date.now() - t0; return reply(out); }

    // STAGE 6 - oauth fetch
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
      out.oauthBody = text.slice(0, 250);
    } catch (e) {
      out.oauthError = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timer);
    }

    out.oauthMs = Date.now() - started;
    out.stageReached = 6;
    out.totalMs = Date.now() - t0;
    return reply(out);
  } catch (error) {
    out.ok = false;
    out.error = error instanceof Error ? error.message : String(error);
    out.totalMs = Date.now() - t0;
    return reply(out, 200);
  }
});
