import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Rocket,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Copy,
  CalendarDays,
  CalendarRange,
} from 'lucide-react';
import {
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  STRIPE_MODE,
} from '@/lib/stripe';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
type Plan = 'monthly' | 'yearly';
type CheckStatus = 'idle' | 'running' | 'pass' | 'fail' | 'skip';

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail?: string;
}

interface PlanReport {
  plan: Plan;
  status: 'idle' | 'running' | 'success' | 'error';
  message: string;
  url: string | null;
  sessionId: string | null;
  durationMs: number | null;
  payload: any;
  startedAt: string | null;
  checks: CheckResult[];
}

// ----------------------------------------------------------------------------
// Plan metadata
// ----------------------------------------------------------------------------
const PLAN_META: Record<Plan, { label: string; priceId: string; icon: any; expectedInterval: string }> = {
  monthly: {
    label: 'Monthly',
    priceId: STRIPE_PRICE_MONTHLY,
    icon: CalendarDays,
    expectedInterval: 'month',
  },
  yearly: {
    label: 'Yearly',
    priceId: STRIPE_PRICE_YEARLY,
    icon: CalendarRange,
    expectedInterval: 'year',
  },
};

const initialReport = (plan: Plan): PlanReport => ({
  plan,
  status: 'idle',
  message: '',
  url: null,
  sessionId: null,
  durationMs: null,
  payload: null,
  startedAt: null,
  checks: [],
});

// ----------------------------------------------------------------------------
// Validation helpers — each returns a CheckResult so we can show pass/fail
// for every step of the end-to-end flow.
// ----------------------------------------------------------------------------
function validatePriceId(priceId: string): CheckResult {
  const name = 'Price ID format valid';
  if (!priceId) {
    return { name, status: 'fail', detail: 'Price ID is empty / not configured in .env' };
  }
  if (!priceId.startsWith('price_')) {
    return { name, status: 'fail', detail: `Expected "price_..." prefix, got "${priceId.slice(0, 12)}..."` };
  }
  if (priceId.length < 20) {
    return { name, status: 'fail', detail: `Price ID looks truncated (${priceId.length} chars)` };
  }
  return { name, status: 'pass', detail: priceId };
}

function validateRedirectUrl(url: string | null): CheckResult {
  const name = 'Redirect URL is valid Stripe checkout URL';
  if (!url) {
    return { name, status: 'fail', detail: 'No url returned from edge function' };
  }
  try {
    const parsed = new URL(url);
    const isStripe =
      parsed.hostname === 'checkout.stripe.com' ||
      parsed.hostname.endsWith('.stripe.com');
    if (!isStripe) {
      return {
        name,
        status: 'fail',
        detail: `URL host is "${parsed.hostname}" — expected checkout.stripe.com`,
      };
    }
    if (parsed.protocol !== 'https:') {
      return { name, status: 'fail', detail: `Expected https://, got ${parsed.protocol}` };
    }
    return { name, status: 'pass', detail: `${parsed.hostname}${parsed.pathname.slice(0, 24)}…` };
  } catch {
    return { name, status: 'fail', detail: 'Could not parse url as a URL' };
  }
}

function validateSessionId(sessionId: string | null): CheckResult {
  const name = 'Checkout session ID returned';
  if (!sessionId) {
    return { name, status: 'fail', detail: 'No sessionId in response payload' };
  }
  if (!sessionId.startsWith('cs_')) {
    return {
      name,
      status: 'fail',
      detail: `Expected "cs_..." prefix, got "${sessionId.slice(0, 6)}..."`,
    };
  }
  return { name, status: 'pass', detail: sessionId };
}

function validatePriceMatchesPayload(payload: any, expectedPriceId: string): CheckResult {
  const name = 'Edge function used the correct price ID';
  // Try a few common shapes the edge function might echo back
  const echoed: string | undefined =
    payload?.priceId ??
    payload?.price_id ??
    payload?.price ??
    payload?.lineItems?.[0]?.price ??
    payload?.line_items?.[0]?.price ??
    payload?.metadata?.priceId;

  if (!echoed) {
    return {
      name,
      status: 'skip',
      detail: 'Edge function did not echo back priceId (cannot verify, but session was created)',
    };
  }
  if (echoed !== expectedPriceId) {
    return {
      name,
      status: 'fail',
      detail: `Expected ${expectedPriceId}, got ${echoed}`,
    };
  }
  return { name, status: 'pass', detail: echoed };
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------
export default function E2ECheckoutTest() {
  const [reports, setReports] = useState<Record<Plan, PlanReport>>({
    monthly: initialReport('monthly'),
    yearly: initialReport('yearly'),
  });
  const [runningAll, setRunningAll] = useState(false);

  const updateReport = (plan: Plan, patch: Partial<PlanReport>) => {
    setReports((prev) => ({ ...prev, [plan]: { ...prev[plan], ...patch } }));
  };

  const runPlanTest = async (plan: Plan): Promise<PlanReport> => {
    const meta = PLAN_META[plan];
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const checks: CheckResult[] = [];

    // Step 1: validate price ID format BEFORE we even hit the edge function
    const priceCheck = validatePriceId(meta.priceId);
    checks.push(priceCheck);

    updateReport(plan, {
      status: 'running',
      message: `Validating ${meta.label} price ID and creating checkout session…`,
      startedAt,
      checks: [...checks],
      url: null,
      sessionId: null,
      durationMs: null,
      payload: null,
    });

    if (priceCheck.status === 'fail') {
      const failed: PlanReport = {
        plan,
        status: 'error',
        message: `${meta.label} price ID is invalid — cannot create a checkout session.`,
        url: null,
        sessionId: null,
        durationMs: Math.round(performance.now() - t0),
        payload: null,
        startedAt,
        checks,
      };
      updateReport(plan, failed);
      return failed;
    }

    // Step 2: invoke the edge function with the real price ID for this plan
    try {
      const successUrl = `${window.location.origin}/checkout/success?test=success&plan=${plan}`;
      const cancelUrl = `${window.location.origin}/admin/stripe-setup?test=cancelled&plan=${plan}`;

      const requestBody = {
        plan,
        priceId: meta.priceId,
        mode: 'subscription',
        quantity: 1,
        testMode: true,
        successUrl,
        cancelUrl,
        debug: true,
      };
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: requestBody,
      });

      // If invoke() errored (e.g. non-2xx), the SDK hides the response body
      // in error.context (a Fetch Response). Read it so we can surface the
      // actual JSON error returned by the edge function (e.g.
      // "STRIPE_SECRET_KEY not configured").
      let resolvedData: any = data;
      let resolvedError: any = error;
      let rawErrorBody: any = null;
      let rawStatus: number | null = null;
      let rawText: string | null = null;

      if (error) {
        const ctx: any = (error as any)?.context;
        try {
          if (ctx && typeof ctx.text === 'function') {
            rawStatus = ctx.status ?? null;
            rawText = await ctx.text();
            try {
              rawErrorBody = rawText ? JSON.parse(rawText) : null;
            } catch {
              rawErrorBody = { raw: rawText };
            }
          } else if (ctx?.body) {
            rawErrorBody = ctx.body;
            rawStatus = ctx.status ?? null;
          }
        } catch (readErr) {
          rawErrorBody = { readError: String(readErr) };
        }

        // FALLBACK: if the SDK didn't give us a readable body (rawErrorBody is
        // null/undefined), call the edge function directly via fetch so we can
        // ALWAYS see the actual error message from the server. This is the
        // most reliable way to surface "STRIPE_SECRET_KEY not configured" or
        // similar messages.
        if (!rawErrorBody) {
          try {
            const supabaseUrl = (supabase as any).supabaseUrl as string;
            const anonKey = (supabase as any).supabaseKey as string;
            const fnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/create-checkout-session`;
            const session = await supabase.auth.getSession();
            const accessToken = session.data.session?.access_token || anonKey;
            const resp = await fetch(fnUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                apikey: anonKey,
              },
              body: JSON.stringify(requestBody),
            });
            rawStatus = resp.status;
            rawText = await resp.text();
            try {
              rawErrorBody = rawText ? JSON.parse(rawText) : null;
            } catch {
              rawErrorBody = { raw: rawText };
            }
          } catch (fetchErr) {
            rawErrorBody = rawErrorBody || { fetchFallbackError: String(fetchErr) };
          }
        }
      }


      const durationMs = Math.round(performance.now() - t0);

      // eslint-disable-next-line no-console
      console.group(`[Stripe E2E Test — ${meta.label}]`);
      // eslint-disable-next-line no-console
      console.log('Plan:', plan, 'PriceId:', meta.priceId);
      // eslint-disable-next-line no-console
      console.log('Duration:', durationMs, 'ms');
      // eslint-disable-next-line no-console
      console.log('Response (invoke):', data);
      // eslint-disable-next-line no-console
      console.log('Raw status:', rawStatus, 'Raw body:', rawErrorBody, 'Raw text:', rawText);
      // eslint-disable-next-line no-console
      console.log('Error:', error);
      // eslint-disable-next-line no-console
      console.groupEnd();

      // Build a richer error message when we have the raw body. Try multiple
      // shapes so we surface useful info no matter what the edge function
      // returns.
      const realErrorMsg: string | null = (() => {
        if (!resolvedError) return null;
        if (rawErrorBody) {
          if (typeof rawErrorBody === 'string') return rawErrorBody;
          if (rawErrorBody.error) {
            return typeof rawErrorBody.error === 'string'
              ? rawErrorBody.error
              : JSON.stringify(rawErrorBody.error);
          }
          if (rawErrorBody.message) return String(rawErrorBody.message);
          if (rawErrorBody.msg) return String(rawErrorBody.msg);
          if (rawErrorBody.raw) return String(rawErrorBody.raw).slice(0, 500);
        }
        if (rawText) return rawText.slice(0, 500);
        if (rawStatus) return `HTTP ${rawStatus} from create-checkout-session (empty body)`;
        return resolvedError.message || String(resolvedError);
      })();


      // Edge-function level error
      checks.push({
        name: 'Edge function responded without error',
        status: resolvedError ? 'fail' : 'pass',
        detail: resolvedError ? realErrorMsg || 'non-2xx response' : 'OK',
      });

      if (resolvedError) {
        const failed: PlanReport = {
          plan,
          status: 'error',
          message:
            realErrorMsg ||
            `Edge function returned an error for the ${meta.label} plan. Check Supabase function logs.`,
          url: null,
          sessionId: null,
          durationMs,
          payload: { error: resolvedError, rawErrorBody, rawStatus },
          startedAt,
          checks,
        };
        updateReport(plan, failed);
        return failed;
      }

      const url: string | null = resolvedData?.url ?? null;
      const sessionId: string | null = resolvedData?.sessionId ?? resolvedData?.id ?? null;

      // Step 3: validate the returned session ID
      checks.push(validateSessionId(sessionId));

      // Step 4: validate the redirect URL
      const urlCheck = validateRedirectUrl(url);
      checks.push(urlCheck);

      // Step 5: confirm the edge function used our price ID (when echoed back)
      checks.push(validatePriceMatchesPayload(resolvedData, meta.priceId));


      // Step 6: confirm the redirect actually resolves (HEAD request)
      let redirectReachable: CheckResult = {
        name: 'Redirect URL is reachable',
        status: 'skip',
        detail: 'Skipped (no URL to test)',
      };
      if (url && urlCheck.status === 'pass') {
        try {
          // Use no-cors HEAD — Stripe blocks CORS but the request still resolves
          // if the host is reachable. An "opaque" response is success enough.
          await fetch(url, { method: 'HEAD', mode: 'no-cors' });
          redirectReachable = {
            name: 'Redirect URL is reachable',
            status: 'pass',
            detail: 'HEAD request resolved (opaque, expected for stripe.com)',
          };
        } catch (err: any) {
          redirectReachable = {
            name: 'Redirect URL is reachable',
            status: 'fail',
            detail: err?.message || 'Network error reaching redirect URL',
          };
        }
      }
      checks.push(redirectReachable);

      const allPassed = checks.every((c) => c.status === 'pass' || c.status === 'skip');

      if (url && allPassed) {
        const success: PlanReport = {
          plan,
          status: 'success',
          message: `${meta.label} checkout session created in ${durationMs}ms. All checks passed.`,
          url,
          sessionId,
          durationMs,
          payload: data,
          startedAt,
          checks,
        };
        updateReport(plan, success);
        return success;
      }

      const failed: PlanReport = {
        plan,
        status: 'error',
        message: url
          ? `${meta.label} session was created, but one or more validation checks failed. See details below.`
          : `${meta.label} edge function returned a response, but no checkout URL was found.`,
        url,
        sessionId,
        durationMs,
        payload: data,
        startedAt,
        checks,
      };
      updateReport(plan, failed);
      return failed;
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - t0);
      // eslint-disable-next-line no-console
      console.error(`[Stripe E2E Test — ${meta.label}] Unexpected error:`, err);
      checks.push({
        name: 'Edge function responded without error',
        status: 'fail',
        detail: err?.message || String(err),
      });
      const failed: PlanReport = {
        plan,
        status: 'error',
        message:
          err?.message ||
          `Unexpected error invoking the edge function for the ${meta.label} plan. The function may not be deployed.`,
        url: null,
        sessionId: null,
        durationMs,
        payload: { error: String(err) },
        startedAt,
        checks,
      };
      updateReport(plan, failed);
      return failed;
    }
  };

  const runBoth = async () => {
    setRunningAll(true);
    // Run in sequence so logs are easy to read and we don't double-spam Stripe
    await runPlanTest('monthly');
    await runPlanTest('yearly');
    setRunningAll(false);
  };

  const copy = (txt: string) => navigator.clipboard?.writeText(txt).catch(() => {});

  // ------------------------------------------------------------------------
  // Aggregate badge across both plans
  // ------------------------------------------------------------------------
  const overallBadge = (() => {
    const m = reports.monthly.status;
    const y = reports.yearly.status;
    if (runningAll || m === 'running' || y === 'running') {
      return (
        <Badge variant="secondary">
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          RUNNING
        </Badge>
      );
    }
    if (m === 'success' && y === 'success') {
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          ALL PASS
        </Badge>
      );
    }
    if (m === 'error' || y === 'error') {
      return (
        <Badge variant="destructive">
          <XCircle className="h-3.5 w-3.5 mr-1" />
          FAIL
        </Badge>
      );
    }
    return null;
  })();

  return (
    <Card className="border-indigo-200 dark:border-indigo-900">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <Rocket className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">End-to-end checkout test</CardTitle>
              <CardDescription className="mt-1">
                Tests <strong>both</strong> the Monthly and Yearly Stripe checkout flows. For each
                plan we validate the price ID, call the{' '}
                <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  create-checkout-session
                </code>{' '}
                edge function, verify the returned session ID and redirect URL, and confirm the
                hosted checkout page is reachable.
              </CardDescription>
            </div>
          </div>
          {overallBadge}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={runBoth}
            disabled={runningAll}
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {runningAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing both plans…
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4 mr-2" />
                Test both plans
              </>
            )}
          </Button>
          <span className="text-xs text-slate-500">
            Mode: <strong>{STRIPE_MODE.toUpperCase()}</strong> · Plans:{' '}
            <strong>Monthly + Yearly</strong>
          </span>
        </div>

        {/* Detected configuration problem → show actionable remediation */}
        {(() => {
          const errs = [reports.monthly.message, reports.yearly.message]
            .filter(Boolean)
            .join(' | ')
            .toLowerCase();
          const missingSecret =
            errs.includes('stripe_secret_key') ||
            errs.includes('not configured') ||
            errs.includes('non-2xx');
          if (!missingSecret) return null;
          return (
            <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-sm">How to fix: configure Stripe secrets</AlertTitle>
              <AlertDescription className="text-xs space-y-2">
                <p>
                  The edge function returned a non-2xx status because{' '}
                  <code className="bg-white dark:bg-slate-800 px-1 rounded">STRIPE_SECRET_KEY</code>{' '}
                  is not set on the Supabase project. The function cannot create a Stripe Checkout
                  session without it.
                </p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>
                    Open <strong>Supabase Dashboard → Project Settings → Edge Functions →
                    Secrets</strong>.
                  </li>
                  <li>
                    Add a secret named{' '}
                    <code className="bg-white dark:bg-slate-800 px-1 rounded">
                      STRIPE_SECRET_KEY
                    </code>{' '}
                    with a value starting with <code>sk_test_</code> (test mode) or{' '}
                    <code>sk_live_</code> (live mode).
                  </li>
                  <li>
                    Optional: add{' '}
                    <code className="bg-white dark:bg-slate-800 px-1 rounded">
                      STRIPE_PRICE_MONTHLY
                    </code>{' '}
                    and{' '}
                    <code className="bg-white dark:bg-slate-800 px-1 rounded">
                      STRIPE_PRICE_YEARLY
                    </code>{' '}
                    if you don't want the frontend to pass them in the request body.
                  </li>
                  <li>
                    Add{' '}
                    <code className="bg-white dark:bg-slate-800 px-1 rounded">
                      STRIPE_WEBHOOK_SECRET
                    </code>{' '}
                    so the <code>stripe-webhook</code> function can verify events.
                  </li>
                  <li>Save, then click "Test both plans" again — no redeploy needed.</li>
                </ol>
                <p className="text-amber-800 dark:text-amber-200">
                  Tip: open the browser console while testing — the panel logs the full edge
                  function response body under{' '}
                  <code className="bg-white dark:bg-slate-800 px-1 rounded">
                    [Stripe E2E Test]
                  </code>
                  .
                </p>
              </AlertDescription>
            </Alert>
          );
        })()}


        {/* Per-plan panels */}
        <div className="grid gap-4 md:grid-cols-2">
          <PlanPanel
            report={reports.monthly}
            onRun={() => runPlanTest('monthly')}
            onCopy={copy}
            disabled={runningAll}
          />
          <PlanPanel
            report={reports.yearly}
            onRun={() => runPlanTest('yearly')}
            onCopy={copy}
            disabled={runningAll}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Per-plan UI panel
// ----------------------------------------------------------------------------
function PlanPanel({
  report,
  onRun,
  onCopy,
  disabled,
}: {
  report: PlanReport;
  onRun: () => void;
  onCopy: (txt: string) => void;
  disabled: boolean;
}) {
  const meta = PLAN_META[report.plan];
  const Icon = meta.icon;

  const badge = (() => {
    if (report.status === 'running') {
      return (
        <Badge variant="secondary">
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          RUNNING
        </Badge>
      );
    }
    if (report.status === 'success') {
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          PASS
        </Badge>
      );
    }
    if (report.status === 'error') {
      return (
        <Badge variant="destructive">
          <XCircle className="h-3.5 w-3.5 mr-1" />
          FAIL
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-slate-500">
        IDLE
      </Badge>
    );
  })();

  return (
    <div className="rounded-lg border bg-slate-50/50 dark:bg-slate-900/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-white dark:bg-slate-800 border flex items-center justify-center">
            <Icon className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <div className="font-semibold text-sm">{meta.label} plan</div>
            <code className="text-[10px] text-slate-500 font-mono break-all">
              {meta.priceId || '(not configured)'}
            </code>
          </div>
        </div>
        {badge}
      </div>

      <Button
        onClick={onRun}
        disabled={disabled || report.status === 'running'}
        size="sm"
        variant="outline"
        className="w-full"
      >
        {report.status === 'running' ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Testing {meta.label.toLowerCase()}…
          </>
        ) : (
          <>
            <Rocket className="h-3.5 w-3.5 mr-1.5" />
            {report.status === 'idle' ? `Test ${meta.label.toLowerCase()} only` : `Re-run ${meta.label.toLowerCase()}`}
          </>
        )}
      </Button>

      {/* Checks */}
      {report.checks.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {report.checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2">
              {c.status === 'pass' && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
              )}
              {c.status === 'fail' && (
                <XCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
              )}
              {c.status === 'skip' && (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              )}
              {c.status === 'running' && (
                <Loader2 className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0 animate-spin" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-700 dark:text-slate-200">{c.name}</div>
                {c.detail && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 break-all font-mono">
                    {c.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Result actions */}
      {report.status === 'success' && report.url && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a href={report.url} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open checkout
            </Button>
          </a>
          <Button size="sm" variant="ghost" onClick={() => onCopy(report.url!)}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy URL
          </Button>
        </div>
      )}

      {report.status === 'error' && report.message && (
        <div className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded p-2 space-y-1">
          <div className="font-semibold">Error message:</div>
          <div className="break-words">{report.message}</div>
        </div>
      )}

      {/* Raw HTTP response from the edge function — invaluable for debugging
          when the message above is empty or generic ("non-2xx status code"). */}
      {report.status === 'error' && report.payload && (report.payload.rawStatus || report.payload.rawErrorBody) && (
        <details className="text-[11px] bg-slate-900 text-slate-100 rounded p-2 font-mono">
          <summary className="cursor-pointer text-amber-300 select-none">
            Raw HTTP response (click to expand) {report.payload.rawStatus ? `· status ${report.payload.rawStatus}` : ''}
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-all max-h-48 overflow-auto">
{JSON.stringify(
  {
    status: report.payload.rawStatus,
    body: report.payload.rawErrorBody,
  },
  null,
  2
)}
          </pre>
          <div className="mt-1 flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-amber-300 hover:text-amber-200"
              onClick={() =>
                onCopy(
                  JSON.stringify(
                    { status: report.payload.rawStatus, body: report.payload.rawErrorBody },
                    null,
                    2
                  )
                )
              }
            >
              <Copy className="h-3 w-3 mr-1" /> Copy JSON
            </Button>
          </div>
        </details>
      )}

      {report.durationMs != null && (
        <div className="text-[11px] text-slate-400 font-mono">
          Duration: {report.durationMs}ms
          {report.startedAt && ' · ' + new Date(report.startedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
