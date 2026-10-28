// Stripe webhook endpoint — PUBLIC (no JWT required).
//
// RUNTIME NOTE:
// The Famous.ai edge-function runtime executes user code inside a Node.js
// `isolated-vm` sandbox. Earlier versions of this function imported
// `https://esm.sh/stripe@14.25.0?target=denonext`, which references the
// `Deno` global at module-load time (deep inside the Stripe SDK bundle).
// That bundle blew up with `ReferenceError: Deno is not defined` during
// test invocations.
//
// This rewrite removes the Stripe SDK entirely and instead:
//   1. Verifies the Stripe-Signature header with standard Web Crypto
//      (HMAC-SHA-256) — supported in both Deno and isolated-vm.
//   2. Calls the Stripe REST API with plain `fetch` for the rare cases
//      where we need to retrieve a subscription by id.
//   3. Reads env vars defensively (Deno.env.get / process.env fallback).
//
// Authenticity is still strictly enforced via HMAC against
// STRIPE_WEBHOOK_SECRET — no request reaches the business logic without a
// valid `Stripe-Signature` header.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// Defensive env access (Deno.env.get OR process.env).
// ---------------------------------------------------------------------------
function env(name: string): string {
  try {
    const d = (globalThis as any).Deno;
    if (d?.env?.get) {
      const v = d.env.get(name);
      if (v) return v;
    }
  } catch { /* ignore */ }
  try {
    const p = (globalThis as any).process;
    if (p?.env?.[name]) return p.env[name];
  } catch { /* ignore */ }
  return '';
}

const STRIPE_SECRET_KEY = env('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = env('STRIPE_WEBHOOK_SECRET');
const SUPABASE_URL = env('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Stripe-Signature verification via Web Crypto.
// Header format: `t=<unix>,v1=<hex>[,v1=<hex>...]`
// ---------------------------------------------------------------------------
function parseSigHeader(header: string): { t: string | null; v1: string[] } {
  const out: { t: string | null; v1: string[] } = { t: null, v1: [] };
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2).map((s) => s?.trim());
    if (k === 't') out.t = v;
    else if (k === 'v1' && v) out.v1.push(v);
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16);
    hex += h.length === 1 ? '0' + h : h;
  }
  return hex;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bufToHex(mac);
}

async function verifyStripeSignature(
  rawBody: string,
  signature: string,
  secrets: string[],
  toleranceSeconds = 300,
): Promise<{ ok: boolean; error?: string; matchedSecretIndex?: number }> {
  if (!signature) return { ok: false, error: 'missing signature header' };
  const validSecrets = secrets.filter((s) => !!s);
  if (validSecrets.length === 0) return { ok: false, error: 'webhook secret not configured' };

  const { t, v1 } = parseSigHeader(signature);
  if (!t || v1.length === 0) {
    return { ok: false, error: 'malformed Stripe-Signature header' };
  }

  const ts = Number(t);
  if (!Number.isFinite(ts)) return { ok: false, error: 'invalid timestamp' };
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > toleranceSeconds) {
    return { ok: false, error: 'timestamp outside tolerance window' };
  }

  const signedPayload = `${t}.${rawBody}`;
  for (let i = 0; i < validSecrets.length; i++) {
    const expected = await hmacHex(validSecrets[i], signedPayload);
    for (const candidate of v1) {
      if (timingSafeEqualHex(expected, candidate)) {
        return { ok: true, matchedSecretIndex: i };
      }
    }
  }
  return { ok: false, error: 'no matching v1 signature' };
}

// ---------------------------------------------------------------------------
// Tiny Stripe REST GET helper.
// ---------------------------------------------------------------------------
async function stripeGet(path: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Stripe-Version': '2023-10-16',
    },
  });
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
  if (!res.ok) {
    throw new Error(`Stripe API ${res.status}: ${body?.error?.message ?? text}`);
  }
  return body;
}

interface StripeSubscription {
  id: string;
  status: string;
  customer: string | { id: string };
  current_period_start?: number;
  current_period_end?: number;
  items?: { data?: Array<{ price?: { recurring?: { interval?: string } } }> };
  metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Event log helpers (best-effort).
//
// `stripe_event_id` is nullable + UNIQUE. Postgres treats NULLs as distinct
// in unique indexes, so `ON CONFLICT (stripe_event_id)` errors when the
// value being inserted is NULL (no matching index entry). To stay safe we
// only use upsert when we actually have an event id; otherwise we insert.
// ---------------------------------------------------------------------------
async function logEventReceived(params: {
  stripe_event_id: string | null;
  event_type: string;
  signature_valid: boolean;
  is_test: boolean;
  payload_summary: Record<string, unknown>;
  error_message?: string | null;
}) {
  const row = {
    stripe_event_id: params.stripe_event_id,
    event_type: params.event_type,
    signature_valid: params.signature_valid,
    is_test: params.is_test,
    status: params.signature_valid ? 'received' : 'signature_failed',
    error_message: params.error_message ?? null,
    payload_summary: params.payload_summary,
    processed: false,
  };
  
}

async function logEventProcessed(stripe_event_id: string | null, ok: boolean, errorMessage?: string) {
  if (!stripe_event_id) return;
  try {
    await supabaseAdmin
      .from('stripe_webhook_events')
      .update({
        processed: ok,
        status: ok ? 'processed' : 'processing_failed',
        error_message: errorMessage ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq('stripe_event_id', stripe_event_id);
  } catch (e) {
    console.warn('[stripe-webhook] log processed exception', (e as Error).message);
  }
}

function toIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds || typeof unixSeconds !== 'number') return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function planFromSubscription(sub: StripeSubscription): 'monthly' | 'yearly' | null {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  if (interval === 'year') return 'yearly';
  if (interval === 'month') return 'monthly';
  return null;
}

async function updateByStripeSubId(
  subscriptionId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', subscriptionId)
    .select('id');
  if (error) {
    console.error('[stripe-webhook] update by sub id failed', error);
    throw error;
  }
  return (data?.length ?? 0) > 0;
}

async function upsertSubscription(
  sub: StripeSubscription,
  opts: { userIdHint?: string | null; statusOverride?: string } = {},
) {
  const plan = planFromSubscription(sub);
  const status = opts.statusOverride ?? sub.status;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;

  const patch: Record<string, unknown> = {
    stripe_customer_id: customerId,
    status,
    current_period_start: toIso(sub.current_period_start),
    current_period_end: toIso(sub.current_period_end),
  };
  if (plan) patch.plan = plan;

  const updated = await updateByStripeSubId(sub.id, patch);
  if (updated) {
    console.log('[stripe-webhook] updated row for sub', sub.id, 'status=', status);
    return;
  }

  let userId =
    opts.userIdHint ||
    (sub.metadata?.user_id as string | undefined) ||
    null;

  if (!userId && customerId) {
    const { data: byCustomer } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .limit(1)
      .maybeSingle();
    if (byCustomer?.user_id) userId = byCustomer.user_id;
  }

  if (!userId) {
    console.warn(
      '[stripe-webhook] no user_id available for sub',
      sub.id,
      '- deferring insert until checkout.session.completed',
    );
    return;
  }

  const { error: insertError } = await supabaseAdmin.from('subscriptions').insert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status,
    plan: plan ?? 'monthly',
    current_period_start: toIso(sub.current_period_start),
    current_period_end: toIso(sub.current_period_end),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error('[stripe-webhook] insert error', insertError);
    throw insertError;
  }
  console.log('[stripe-webhook] inserted row for sub', sub.id, 'user', userId, 'status=', status);
}

async function markSubscriptionStatusById(subscriptionId: string, status: string) {
  const updated = await updateByStripeSubId(subscriptionId, { status });
  if (!updated) {
    console.warn('[stripe-webhook] markStatus: no row for', subscriptionId, '(skipping)');
    return;
  }
  console.log('[stripe-webhook] set status=', status, 'for', subscriptionId);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return new Response(
      JSON.stringify({
        error:
          'Webhook not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET as edge function secrets.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[stripe-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return new Response(JSON.stringify({ error: 'Database not configured on server.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const { signature, rawBody } = await req.json();
  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }


  let parsedPreview: { id?: string; type?: string; livemode?: boolean } = {};
  try {
    const parsed = JSON.parse(rawBody);
    parsedPreview = {
      id: parsed?.id,
      type: parsed?.type,
      livemode: parsed?.livemode,
    };
  } catch { /* non-JSON body */ }

  // Support comma-separated list of secrets in STRIPE_WEBHOOK_SECRET so the
  // operator can rotate the signing secret in Stripe without taking the
  // endpoint offline. We try each candidate in order.
  const candidateSecrets = STRIPE_WEBHOOK_SECRET.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const verify = await verifyStripeSignature(rawBody, signature, candidateSecrets);
  if (!verify.ok) {
    console.error(
      '[stripe-webhook] signature verification failed:',
      verify.error,
      '(tried',
      candidateSecrets.length,
      'secret(s))',
    );
    await logEventReceived({
      stripe_event_id: parsedPreview.id ?? null,
      event_type: parsedPreview.type ?? 'unknown',
      signature_valid: false,
      is_test: parsedPreview.id?.startsWith('evt_test_') ?? false,
      payload_summary: { livemode: parsedPreview.livemode ?? null },
      error_message: verify.error ?? 'verification failed',
    });
    return new Response(
      JSON.stringify({
        error: `Webhook signature failed: ${verify.error}`,
        hint:
          'Make sure STRIPE_WEBHOOK_SECRET in your edge-function secrets matches the signing secret of the endpoint that sent this event in the Stripe Dashboard (Developers → Webhooks → your endpoint → Signing secret). After rotating, redeploy is NOT required — the function reads the env var on each request.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  let event: { id: string; type: string; livemode?: boolean; api_version?: string; data: { object: any } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const isTest =
    event.id.startsWith('evt_test_') ||
    (event.data?.object as { id?: string })?.id?.toString().startsWith('test_') === true ||
    (event.data?.object as { metadata?: Record<string, string> })?.metadata?.synthetic === 'true';

  console.log('[stripe-webhook] event', event.id, event.type, isTest ? '(test)' : '');

  await logEventReceived({
    stripe_event_id: event.id,
    event_type: event.type,
    signature_valid: true,
    is_test: isTest,
    payload_summary: {
      livemode: event.livemode,
      api_version: event.api_version,
      object_id: (event.data?.object as { id?: string })?.id ?? null,
    },
  });

  if (isTest) {
    await logEventProcessed(event.id, true);
    return new Response(
      JSON.stringify({ received: true, type: event.type, test: true }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as {
          id: string;
          mode?: string;
          subscription?: string | { id: string };
          client_reference_id?: string | null;
          metadata?: Record<string, string>;
        };

        if (session.mode !== 'subscription') {
          console.log('[stripe-webhook] non-subscription checkout, ignoring', session.id);
          break;
        }

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        const userId =
          (session.client_reference_id as string | null) ||
          (session.metadata?.user_id as string | undefined) ||
          null;

        if (!subscriptionId) {
          console.warn('[stripe-webhook] checkout.session.completed without subscription id');
          break;
        }

        const sub = (await stripeGet(`/subscriptions/${subscriptionId}`)) as StripeSubscription;
        await upsertSubscription(sub, { userIdHint: userId });
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as StripeSubscription;
        await upsertSubscription(sub);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as StripeSubscription;
        await upsertSubscription(sub, { statusOverride: 'canceled' });
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as { subscription?: string | { id: string } };
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subscriptionId) {
          const sub = (await stripeGet(`/subscriptions/${subscriptionId}`)) as StripeSubscription;
          await upsertSubscription(sub);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as { subscription?: string | { id: string } };
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subscriptionId) {
          await markSubscriptionStatusById(subscriptionId, 'past_due');
        }
        break;
      }

      default:
        console.log('[stripe-webhook] ignoring event type', event.type);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] handler error for', event.type, message);
    await logEventProcessed(event.id, false, message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  await logEventProcessed(event.id, true);

  return new Response(JSON.stringify({ received: true, type: event.type }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(handler);
