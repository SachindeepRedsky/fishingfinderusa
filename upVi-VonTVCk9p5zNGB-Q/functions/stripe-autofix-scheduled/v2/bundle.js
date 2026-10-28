// Scheduled wrapper around the stripe-autofix `detect` action.
//
// Behavior:
//  1. Loads schedule config from `stripe_autofix_schedule` (singleton row).
//  2. If enabled, calls the existing `stripe-autofix` edge function with
//     action=detect using the saved price IDs / mode / webhook URL.
//  3. If config.auto_fix is true and fixable issues are detected, invokes the
//     matching fix actions (fix-webhook, sync-prices, create-recurring-prices)
//     for every fixable issue, then re-runs detect to confirm the issues are
//     gone. Per-fix outcomes are recorded.
//  4. Persists the scan result (and any auto-fix results) into
//     `stripe_autofix_scan_log`.
//  5. If any errors or warnings remain, notifies via:
//       - Email (using GATEWAY_API_KEY → Resend) if notification_email set
//       - HTTP POST to scan_webhook_url if set
//     The notification includes both the original issues and the auto-fix
//     outcomes / post-fix scan summary.
//  6. Returns the full scan summary so the UI can render it as the "last
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

interface AutoFixAttempt {
  issueId: string;
  issueTitle: string;
  fixAction: string;
  ok: boolean;
  message?: string;
  error?: string;
}

// Fix actions we can invoke automatically without user input.
const AUTO_FIXABLE_ACTIONS = new Set([
  'fix-webhook',
  'sync-prices',
  'create-recurring-prices',
]);

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

async function invokeAutofix(
  action: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-autofix`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!resp.ok) {
    throw new Error(`stripe-autofix ${action} failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

async function detect(config: Record<string, unknown>): Promise<DetectResponse> {
  return (await invokeAutofix('detect', {
    frontendMode: config.frontend_mode || 'test',
    monthlyPriceId: config.monthly_price_id || null,
    yearlyPriceId: config.yearly_price_id || null,
    webhookUrl: config.webhook_url || null,
  })) as DetectResponse;
}

async function runAutoFixes(
  issues: Issue[],
  config: Record<string, unknown>,
): Promise<AutoFixAttempt[]> {
  const attempts: AutoFixAttempt[] = [];
  const fixable = issues.filter(
    (i) => i.fixable && i.fixAction && AUTO_FIXABLE_ACTIONS.has(i.fixAction),
  );

  // De-duplicate by fixAction — running e.g. sync-prices once handles all
  // related price issues simultaneously.
  const seen = new Set<string>();
  const ordered: Issue[] = [];
  for (const issue of fixable) {
    const key = issue.fixAction!;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(issue);
  }

  // Run fix-webhook first (idempotent), then sync-prices, then create-recurring-prices
  const priority = ['fix-webhook', 'sync-prices', 'create-recurring-prices'];
  ordered.sort(
    (a, b) => priority.indexOf(a.fixAction!) - priority.indexOf(b.fixAction!),
  );

  for (const issue of ordered) {
    const action = issue.fixAction!;
    try {
      const payload: Record<string, unknown> = {
        frontendMode: config.frontend_mode || 'test',
      };
      if (action === 'fix-webhook') {
        payload.webhookUrl = config.webhook_url || null;
      }
      const result = (await invokeAutofix(action, payload)) as {
        message?: string;
        ok?: boolean;
      };
      attempts.push({
        issueId: issue.id,
        issueTitle: issue.title,
        fixAction: action,
        ok: result?.ok !== false,
        message:
          result?.message ||
          (action === 'fix-webhook'
            ? 'Webhook auto-created / updated'
            : action === 'sync-prices'
            ? 'Synced prices from Stripe'
            : 'Created recurring prices'),
      });
    } catch (err) {
      attempts.push({
        issueId: issue.id,
        issueTitle: issue.title,
        fixAction: action,
        ok: false,
        error: (err as Error).message,
      });
    }
  }

  return attempts;
}

function buildEmailHtml(
  issues: Issue[],
  backendMode: string,
  errorCount: number,
  warningCount: number,
  autoFixAttempts: AutoFixAttempt[] | null,
  postFix: { errorCount: number; warningCount: number; issues: Issue[] } | null,
) {
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

  let autoFixSection = '';
  if (autoFixAttempts && autoFixAttempts.length > 0) {
    const fixRows = autoFixAttempts
      .map((a) => {
        const color = a.ok ? '#059669' : '#dc2626';
        const status = a.ok ? '✓ APPLIED' : '✗ FAILED';
        const detail = a.ok
          ? a.message || ''
          : a.error || 'Unknown error';
        return `<tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:${color};font-weight:600;font-size:11px;">${status}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;"><strong>${a.issueTitle}</strong><br/><span style="color:#475569;font-size:12px;">action: <code>${a.fixAction}</code> — ${detail}</span></td>
        </tr>`;
      })
      .join('');

    const postFixSummary = postFix
      ? postFix.errorCount === 0 && postFix.warningCount === 0
        ? `<p style="color:#059669;margin:8px 0 0 0;font-size:13px;"><strong>✓ Post-fix scan: all clear.</strong> All detected issues have been resolved.</p>`
        : `<p style="color:#d97706;margin:8px 0 0 0;font-size:13px;"><strong>Post-fix scan:</strong> ${postFix.errorCount} error(s), ${postFix.warningCount} warning(s) remaining (see list above).</p>`
      : '';

    autoFixSection = `
      <h2 style="margin:24px 0 8px 0;font-size:16px;">Automatic fixes applied</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f1f5f9;"><th style="text-align:left;padding:8px;">Status</th><th style="text-align:left;padding:8px;">Fix</th></tr></thead>
        <tbody>${fixRows}</tbody>
      </table>
      ${postFixSummary}
    `;
  }

  const initialIssuesSection =
    issues.length > 0
      ? `<h2 style="margin:0 0 8px 0;font-size:16px;">${
          autoFixAttempts ? 'Issues detected (before auto-fix)' : 'Issues detected'
        }</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f1f5f9;"><th style="text-align:left;padding:8px;">Severity</th><th style="text-align:left;padding:8px;">Issue</th><th style="text-align:left;padding:8px;">Fix</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`
      : '';

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;padding:20px;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
    <h1 style="margin:0 0 8px 0;font-size:20px;">Stripe Auto-fix daily scan</h1>
    <p style="color:#64748b;margin:0 0 16px 0;font-size:13px;">Backend mode: <strong>${backendMode}</strong> · ${errorCount} error(s) · ${warningCount} warning(s)${
    autoFixAttempts ? ` · auto-fix: ${autoFixAttempts.length} attempt(s)` : ''
  }</p>
    ${initialIssuesSection}
    ${autoFixSection}
    <p style="color:#64748b;font-size:12px;margin-top:16px;">Visit your Stripe Setup page for full details.</p>
  </div>
</body></html>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get('GATEWAY_API_KEY');
  if (!apiKey) return { ok: false, error: 'GATEWAY_API_KEY not configured' };

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

    // 2. Run initial detect
    let scanResult: DetectResponse | null = null;
    let scanError: string | null = null;
    try {
      scanResult = await detect(config);
    } catch (err) {
      scanError = (err as Error).message;
    }

    const issues = scanResult?.issues ?? [];
    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const backendMode = scanResult?.backendMode ?? 'unknown';

    // 3. Optionally auto-fix detected issues, then re-detect
    let autoFixAttempted = false;
    let autoFixResults: AutoFixAttempt[] | null = null;
    let postFixIssues: Issue[] | null = null;
    let postFixErrorCount: number | null = null;
    let postFixWarningCount: number | null = null;

    if (
      !scanError &&
      config.auto_fix === true &&
      (errorCount > 0 || warningCount > 0)
    ) {
      autoFixAttempted = true;
      try {
        autoFixResults = await runAutoFixes(issues, config);
        // Re-run detect to confirm fixes
        try {
          const rescan = await detect(config);
          postFixIssues = rescan.issues ?? [];
          postFixErrorCount = postFixIssues.filter((i) => i.severity === 'error').length;
          postFixWarningCount = postFixIssues.filter((i) => i.severity === 'warning').length;
        } catch (err) {
          // Re-detect failed — keep autoFixResults but record the error in scanError
          scanError = `Post-fix re-detect failed: ${(err as Error).message}`;
        }
      } catch (err) {
        scanError = `Auto-fix loop failed: ${(err as Error).message}`;
      }
    }

    // 4. Notify if errors or warnings (or scan itself failed).
    //    When auto-fix ran successfully and resolved everything, we still
    //    notify so admins know fixes happened — but with a different subject.
    let notified = false;
    let notificationChannel: string | null = null;
    let notificationError: string | null = null;

    const remainingErrors = postFixErrorCount ?? errorCount;
    const remainingWarnings = postFixWarningCount ?? warningCount;
    const anyIssueEverFound = errorCount > 0 || warningCount > 0;
    const shouldNotify =
      !!scanError || anyIssueEverFound || (autoFixResults && autoFixResults.length > 0);

    if (shouldNotify) {
      const channels: string[] = [];
      const errors: string[] = [];

      if (config.notification_email) {
        let subject: string;
        if (scanError) {
          subject = `[Stripe Auto-fix] Scheduled scan FAILED`;
        } else if (autoFixResults && autoFixResults.length > 0) {
          if (remainingErrors === 0 && remainingWarnings === 0) {
            subject = `[Stripe Auto-fix] ${autoFixResults.length} issue(s) auto-fixed — all clear`;
          } else {
            subject = `[Stripe Auto-fix] Auto-fix ran — ${remainingErrors} error(s), ${remainingWarnings} warning(s) remaining`;
          }
        } else {
          subject = `[Stripe Auto-fix] ${errorCount} error(s), ${warningCount} warning(s) detected`;
        }

        const html = scanError
          ? `<p>Scheduled stripe-autofix scan failed:</p><pre>${scanError}</pre>${
              autoFixResults
                ? `<p>Auto-fix attempts before failure:</p><pre>${JSON.stringify(autoFixResults, null, 2)}</pre>`
                : ''
            }`
          : buildEmailHtml(
              issues,
              backendMode,
              errorCount,
              warningCount,
              autoFixResults,
              postFixIssues
                ? {
                    errorCount: postFixErrorCount ?? 0,
                    warningCount: postFixWarningCount ?? 0,
                    issues: postFixIssues,
                  }
                : null,
            );
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
          autoFixAttempted,
          autoFixResults,
          postFixErrorCount,
          postFixWarningCount,
          postFixIssues,
          scanError,
        });
        if (r.ok) channels.push('webhook');
        else errors.push(`webhook: ${r.error}`);
      }

      notified = channels.length > 0;
      notificationChannel = channels.join(',') || null;
      notificationError = errors.length > 0 ? errors.join(' | ') : null;
    }

    // 5. Persist scan log
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
      auto_fix_attempted: autoFixAttempted,
      auto_fix_results: autoFixResults,
      post_fix_error_count: postFixErrorCount,
      post_fix_warning_count: postFixWarningCount,
      post_fix_issues: postFixIssues,
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
        autoFixAttempted,
        autoFixResults,
        postFixErrorCount,
        postFixWarningCount,
        postFixIssues,
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
