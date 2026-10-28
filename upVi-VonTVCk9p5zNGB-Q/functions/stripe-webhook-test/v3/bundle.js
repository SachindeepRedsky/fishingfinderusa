// stripe-webhook-test
// Admin diagnostic endpoint backing the "Test webhook delivery" panel on
// /admin/FamousPay-setup.
//
// Two actions:
//   { action: 'list' }   -> returns the last 10 received webhook events
//   { action: 'send' }   -> sends a synthetic, properly-signed test event to
//                            the stripe-webhook endpoint and reports back
//                            whether the endpoint validated and processed it.
//                            Also sends a SECOND request with a tampered
//                            signature to prove the endpoint correctly
//                            REJECTS forged events.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Use service role if available, otherwise anon key. We pass the auth headers
// explicitly via `global.headers` because some hosted gateways require both
// `apikey` AND `Authorization: Bearer …` on every PostgREST request.
const dbKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
const supabaseRead = createClient(SUPABASE_URL, dbKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: {
      apikey: dbKey,
      Authorization: `Bearer ${dbKey}`,
    },
  },
});

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(sigBuf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

function buildSyntheticEvent() {
  const timestamp = Math.floor(Date.now() / 1000);
  const eventId = `evt_test_synthetic_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: eventId,
    object: 'event',
    api_version: '2023-10-16',
    created: timestamp,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'famouspay.diagnostic.test',
    data: {
      object: {
        id: `test_obj_${timestamp}`,
        object: 'diagnostic_test',
        synthetic: true,
        message: 'Synthetic event from /admin/FamousPay-setup',
      },
    },
  };
}

async function listRecentEvents() {
  // Fall back to a direct REST call if the JS client gateway rejects auth.
  const restUrl = `${SUPABASE_URL}/rest/v1/stripe_webhook_events?select=id,stripe_event_id,event_type,signature_valid,processed,is_test,status,error_message,received_at,processed_at&order=received_at.desc&limit=10`;
  try {
    const resp = await fetch(restUrl, {
      headers: {
        apikey: dbKey,
        Authorization: `Bearer ${dbKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, error: `REST ${resp.status}: ${text.slice(0, 200)}`, events: [] as unknown[] };
    }
    const data = await resp.json();
    return { ok: true, events: (data ?? []) as unknown[] };
  } catch (e) {
    return { ok: false, error: (e as Error).message, events: [] as unknown[] };
  }
}

async function postToWebhook(rawBody: string, signatureHeader: string) {
  const url = `${SUPABASE_URL}/functions/v1/stripe-webhook`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'stripe-signature': signatureHeader,
  };
  if (SUPABASE_ANON_KEY) {
    headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
    headers['apikey'] = SUPABASE_ANON_KEY;
  }

  const start = Date.now();
  const resp = await fetch(url, { method: 'POST', headers, body: rawBody });
  const durationMs = Date.now() - start;
  let bodyText = '';
  try {
    bodyText = await resp.text();
  } catch {
    bodyText = '';
  }
  return { status: resp.status, ok: resp.ok, body: bodyText, durationMs };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Silence unused-var warning in some configs
  void supabaseRead;

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body?.action ?? 'list';

    // ---------------- LIST ----------------
    if (action === 'list') {
      const result = await listRecentEvents();
      return new Response(
        JSON.stringify({
          action: 'list',
          webhookSecretConfigured: !!STRIPE_WEBHOOK_SECRET,
          envDebug: {
            hasUrl: !!SUPABASE_URL,
            hasServiceRole: !!SUPABASE_SERVICE_ROLE_KEY,
            hasAnon: !!SUPABASE_ANON_KEY,
          },
          ...result,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // ---------------- SEND ----------------
    if (action === 'send') {
      if (!STRIPE_WEBHOOK_SECRET) {
        return new Response(
          JSON.stringify({
            action: 'send',
            ok: false,
            webhookSecretConfigured: false,
            error:
              'STRIPE_WEBHOOK_SECRET is not set. Add it as an Edge Function secret before testing webhook delivery.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
      }

      if (!SUPABASE_URL) {
        return new Response(
          JSON.stringify({
            action: 'send',
            ok: false,
            error: 'SUPABASE_URL not configured on server.',
          }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
      }

      const event = buildSyntheticEvent();
      const rawBody = JSON.stringify(event);
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${rawBody}`;
      const validSignature = await hmacSha256Hex(STRIPE_WEBHOOK_SECRET, signedPayload);
      const validHeader = `t=${timestamp},v1=${validSignature}`;

      let validResult: { status: number; ok: boolean; body: string; durationMs: number } | null = null;
      let validErr: string | null = null;
      try {
        validResult = await postToWebhook(rawBody, validHeader);
      } catch (e) {
        validErr = (e as Error).message;
      }

      const tamperedHeader = `t=${timestamp},v1=${'0'.repeat(64)}`;
      let tamperedResult: { status: number; ok: boolean; body: string; durationMs: number } | null = null;
      let tamperedErr: string | null = null;
      try {
        tamperedResult = await postToWebhook(rawBody, tamperedHeader);
      } catch (e) {
        tamperedErr = (e as Error).message;
      }

      await new Promise((r) => setTimeout(r, 600));
      const recent = await listRecentEvents();

      const validAccepted = !!validResult && validResult.status === 200;
      const tamperedRejected = !!tamperedResult && tamperedResult.status === 400;

      const loggedRow =
        (recent.events as Array<{ stripe_event_id: string }> | undefined)?.find(
          (e) => e.stripe_event_id === event.id,
        ) ?? null;

      const overallOk = validAccepted && tamperedRejected && !!loggedRow;

      let summary = '';
      if (overallOk) {
        summary =
          'Webhook is fully operational. Valid signatures are accepted, forged signatures are rejected, and events are being logged correctly.';
      } else if (!validAccepted) {
        summary =
          'The webhook endpoint rejected a properly-signed test event. STRIPE_WEBHOOK_SECRET on the webhook function likely does not match the value used to sign — re-copy the signing secret from the Stripe Dashboard webhook endpoint.';
      } else if (!tamperedRejected) {
        summary =
          'WARNING: the endpoint accepted an invalid signature. This is a security issue — the webhook function is not verifying signatures properly.';
      } else if (!loggedRow) {
        summary =
          'Signature checks worked, but the test event was not found in the events log. The stripe_webhook_events table may be missing or the webhook function could not write to it.';
      }

      return new Response(
        JSON.stringify({
          action: 'send',
          ok: overallOk,
          webhookSecretConfigured: true,
          summary,
          eventId: event.id,
          eventType: event.type,
          tests: {
            validSignature: {
              expected: 200,
              status: validResult?.status ?? null,
              accepted: validAccepted,
              durationMs: validResult?.durationMs ?? null,
              responseBody: validResult?.body ?? null,
              error: validErr,
            },
            tamperedSignature: {
              expected: 400,
              status: tamperedResult?.status ?? null,
              rejected: tamperedRejected,
              durationMs: tamperedResult?.durationMs ?? null,
              responseBody: tamperedResult?.body ?? null,
              error: tamperedErr,
            },
            logging: {
              eventLogged: !!loggedRow,
              loggedRow,
            },
          },
          recentEvents: recent.events ?? [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action '${action}'. Use 'list' or 'send'.` }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
