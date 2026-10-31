// Returns the most recent Stripe webhook events captured by the
// `stripe-webhook` edge function. Used by the admin Stripe Setup page to
// verify that subscription.created / invoice.paid events are flowing
// end-to-end.
//
// Reads from public.stripe_webhook_events using the service role key to
// bypass RLS. This is admin telemetry — payload_summary is intentionally
// limited (no PII / card data).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface WebhookEventRow {
  id: string;
  stripe_event_id: string | null;
  event_type: string;
  signature_valid: boolean;
  processed: boolean;
  is_test: boolean;
  status: string | null;
  error_message: string | null;
  payload_summary: Record<string, unknown> | null;
  received_at: string;
  processed_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({
        error:
          'Database not configured on server. Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  let limit = 20;
  let includeTest = true;
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.limit === 'number' && body.limit > 0 && body.limit <= 100) {
        limit = Math.floor(body.limit);
      }
      if (typeof body?.includeTest === 'boolean') {
        includeTest = body.includeTest;
      }
    }
  } catch {
    // ignore — use defaults
  }

  // Aggregate counts for the dashboard summary
  const [{ data: rows, error: listError }, totalsResult] = await Promise.all([
    (async () => {
      let q = supabaseAdmin
        .from('stripe_webhook_events')
        .select(
          'id, stripe_event_id, event_type, signature_valid, processed, is_test, status, error_message, payload_summary, received_at, processed_at',
        )
        .order('received_at', { ascending: false })
        .limit(limit);
      if (!includeTest) q = q.eq('is_test', false);
      return await q;
    })(),
    (async () => {
      // separate counts so we can show both real + test
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [total, last24h, failed, sigFailed, subEvents, invoicePaid] = await Promise.all([
        supabaseAdmin
          .from('stripe_webhook_events')
          .select('id', { count: 'exact', head: true }),
        supabaseAdmin
          .from('stripe_webhook_events')
          .select('id', { count: 'exact', head: true })
          .gte('received_at', since),
        supabaseAdmin
          .from('stripe_webhook_events')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'processing_failed'),
        supabaseAdmin
          .from('stripe_webhook_events')
          .select('id', { count: 'exact', head: true })
          .eq('signature_valid', false),
        supabaseAdmin
          .from('stripe_webhook_events')
          .select('id', { count: 'exact', head: true })
          .like('event_type', 'customer.subscription.%'),
        supabaseAdmin
          .from('stripe_webhook_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'invoice.paid'),
      ]);
      return {
        total: total.count ?? 0,
        last24h: last24h.count ?? 0,
        failed: failed.count ?? 0,
        signatureFailed: sigFailed.count ?? 0,
        subscriptionEvents: subEvents.count ?? 0,
        invoicePaid: invoicePaid.count ?? 0,
      };
    })(),
  ]);

  if (listError) {
    return new Response(
      JSON.stringify({
        error: `Failed to query stripe_webhook_events: ${listError.message}`,
        hint:
          'If the error is "relation does not exist", the stripe-webhook function has not been deployed yet (the table is auto-created when needed) — or the migration was not applied.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  // Find the latest event of a few key types so the UI can show "last seen X minutes ago"
  const events = (rows ?? []) as WebhookEventRow[];
  const latestByType: Record<string, string> = {};
  for (const e of events) {
    if (!latestByType[e.event_type]) {
      latestByType[e.event_type] = e.received_at;
    }
  }

  return new Response(
    JSON.stringify({
      events,
      totals: totalsResult,
      latestByType,
      generatedAt: new Date().toISOString(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
  );
});
