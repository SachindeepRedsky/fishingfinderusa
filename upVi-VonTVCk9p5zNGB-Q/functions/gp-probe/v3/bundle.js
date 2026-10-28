export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
  }
  return out;
}

function decodeBase64(value) {
  const clean = String(value).replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let n = 0, buffer = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = B64.indexOf(clean[i]);
    if (c < 0) continue;
    buffer = (buffer << 6) | c;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[n++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.slice(0, n);
}

function b64url(bytes) {
  return encodeBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlStr(v) {
  return b64url(new TextEncoder().encode(v));
}

function reply(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const t0 = Date.now();
  const out = { ok: true, stageReached: 0 };

  try {
    const body = await req.json().catch(() => ({}));
    const stage = Number((body && body.stage) || 6);

    const raw = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") || "";
    out.serviceAccountChars = raw.length;
    out.stageReached = 1;
    if (stage <= 1) { out.totalMs = Date.now() - t0; return reply(out); }

    const creds = JSON.parse(raw);
    out.clientEmail = creds.client_email || null;
    out.stageReached = 2;
    if (stage <= 2) { out.totalMs = Date.now() - t0; return reply(out); }

    const pemBody = String(creds.private_key)
      .replace(/\\n/g, "\n")
      .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "")
      .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, "")
      .replace(/\s+/g, "");

    const keyBytes = decodeBase64(pemBody);
    out.pkcs8Bytes = keyBytes.length;
    out.stageReached = 3;
    if (stage <= 3) { out.totalMs = Date.now() - t0; return reply(out); }

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
      out.oauthBody = text.slice(0, 200);
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
    return reply(out);
  }
});
