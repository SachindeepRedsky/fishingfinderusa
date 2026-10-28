// Scheduled wrapper around the stripe-autofix `detect` action.
//
// Behavior:
//  1. Loads schedule config from `stripe_autofix_schedule` (singleton row).
//  2. If enabled, calls the existing `stripe-autofix` edge function with
//     action=detect using the saved price IDs / mode / webhook URL.
//  3. Persists the scan result into `stripe_autofix_scan_log`.
//  4. If any errors or warnings are found, notifies via:
//       - Email (using GATEWAY_API_KEY → Resend) if notification_email set
//       - HTTP POST to scan_webhook_url if set
//  5. Returns the full scan summary so the UI can render it as the "last
//     scheduled scan result".
//
// Triggered:
//  - Manually from the UI ("Run scheduled scan now" button)
//  - Via cron / external scheduler hitting this endpoint with
//    { trigger: "scheduled" }
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Issue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  fixable: boolean;
  fixAction?: string;
}

interface DetectResponse {
  issues: Issue[];
  backendMode: string;
}

async function readSupabase(table: string, filter = '') {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}${filter ? `?${filter}` : ''}`;
  const resp = await fetch(url, {
    headers: {
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
    },
  });
  if (!resp.ok) {
    throw new Error(`Read ${table} failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

async function writeSupabase(table: string, body: unknown, prefer = 'return=representation') {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
      Prefer: prefer,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`Write ${table} failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

async function invokeAutofix(payload: Record<string, unknown>): Promise<DetectResponse> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-autofix`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    },
    body: JSON.stringify({ action: 'detect', ...payload }),
  });
  if (!resp.ok) {
    throw new Error(`stripe-autofix detect failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

function buildEmailHtml(issues: Issue[], backendMode: string, errorCount: number, warningCount: number) {
  const rows = issues
    .map((i) => {
      const color =
        i.severity === 'error' ? '#dc2626' : i.severity === 'warning' ? '#d97706' : '#2563eb';
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:${color};font-weight:600;text-transform:uppercase;font-size:11px;">${i.severity}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;"><strong>${i.title}</strong><br/><span style="color:#475569;font-size:13px;">${i.description}</span></td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#475569;">${i.fixable ? 'Auto-fixable' : 'Manual'}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;padding:20px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
    <h1 style="margin:0 0 8px 0;font-size:20px;">Stripe Auto-fix daily scan</h1>
    <p style="color:#64748b;margin:0 0 16px 0;font-size:13px;">Backend mode: <strong>${backendMode}</strong> · ${errorCount} error(s) · ${warningCount} warning(s)</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f1f5f9;"><th style="text-align:left;padding:8px;">Severity</th><th style="text-align:left;padding:8px;">Issue</th><th style="text-align:left;padding:8px;">Fix</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#64748b;font-size:12px;margin-top:16px;">Visit your Stripe Setup page to apply auto-fixes.</p>
  </div>
</body></html>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get('GATEWAY_API_KEY');
  if (!apiKey) return { ok: false, error: 'GATEWAY_API_KEY not configured' };

  // Try Famous gateway first (relays to Resend or whichever provider is configured)
  try {
    const resp = await fetch('https://famous.ai/api/gateway/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to,
        from: 'Stripe Auto-fix <noreply@famous.ai>',
        subject,
        html,
      }),
    });
    if (resp.ok) return { ok: true };
    const text = await resp.text();
    return { ok: false, error: `Gateway email failed: ${resp.status} ${text}` };
  } catch (err) {
    return { ok: false, error: `Gateway email error: ${(err as Error).message}` };
  }
}

async function postWebhook(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      return { ok: false, error: `Webhook returned ${resp.status}: ${await resp.text()}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let trigger = 'scheduled';
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.trigger) trigger = String(body.trigger);
  } catch {
    // ignore - body optional
  }

  try {
    // 1. Load schedule config
    const rows = await readSupabase(
      'stripe_autofix_schedule',
      `id=eq.singleton&select=*`,
    );
    const config = Array.isArray(rows) && rows[0] ? rows[0] : null;

    if (!config) {
      return new Response(
        JSON.stringify({ ok: false, error: 'No schedule config row found' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    if (!config.enabled && trigger === 'scheduled') {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'schedule disabled' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // 2. Run detect
    let scanResult: DetectResponse | null = null;
    let scanError: string | null = null;
    try {
      scanResult = await invokeAutofix({
        frontendMode: config.frontend_mode || 'test',
        monthlyPriceId: config.monthly_price_id || null,
        yearlyPriceId: config.yearly_price_id || null,
        webhookUrl: config.webhook_url || null,
      });
    } catch (err) {
      scanError = (err as Error).message;
    }

    const issues = scanResult?.issues ?? [];
    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const backendMode = scanResult?.backendMode ?? 'unknown';

    // 3. Notify if errors or warnings (or scan itself failed)
    let notified = false;
    let notificationChannel: string | null = null;
    let notificationError: string | null = null;
    const shouldNotify = !!scanError || errorCount > 0 || warningCount > 0;

    if (shouldNotify) {
      const channels: string[] = [];
      const errors: string[] = [];

      if (config.notification_email) {
        const subject = scanError
          ? `[Stripe Auto-fix] Scheduled scan FAILED`
          : `[Stripe Auto-fix] ${errorCount} error(s), ${warningCount} warning(s) detected`;
        const html = scanError
          ? `<p>Scheduled stripe-autofix scan failed:</p><pre>${scanError}</pre>`
          : buildEmailHtml(issues, backendMode, errorCount, warningCount);
        const r = await sendEmail(config.notification_email, subject, html);
        if (r.ok) channels.push('email');
        else errors.push(`email: ${r.error}`);
      }

      if (config.scan_webhook_url) {
        const r = await postWebhook(config.scan_webhook_url, {
          source: 'stripe-autofix-scheduled',
          trigger,
          scannedAt: new Date().toISOString(),
          backendMode,
          errorCount,
          warningCount,
          issues,
          scanError,
        });
        if (r.ok) channels.push('webhook');
        else errors.push(`webhook: ${r.error}`);
      }

      notified = channels.length > 0;
      notificationChannel = channels.join(',') || null;
      notificationError = errors.length > 0 ? errors.join(' | ') : null;
    }

    // 4. Persist scan log
    await writeSupabase('stripe_autofix_scan_log', {
      trigger,
      error_count: errorCount,
      warning_count: warningCount,
      issues,
      backend_mode: backendMode,
      notified,
      notification_channel: notificationChannel,
      notification_error: notificationError,
      scan_error: scanError,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        trigger,
        backendMode,
        errorCount,
        warningCount,
        notified,
        notificationChannel,
        notificationError,
        scanError,
        issues,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
