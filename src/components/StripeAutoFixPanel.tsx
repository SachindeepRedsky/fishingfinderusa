import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wrench,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Copy,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import {
  STRIPE_MODE,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
} from '@/lib/stripe';
import StripeModeCompareCard from '@/components/StripeModeCompareCard';
import StripeAutoFixScheduleSection from '@/components/StripeAutoFixScheduleSection';


interface Issue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  fixable: boolean;
  fixAction?: 'fix-webhook' | 'sync-prices' | 'clone-prices' | 'create-recurring-prices' | 'manual';
  manualSteps?: string[];
  data?: Record<string, unknown>;
}



interface DetectResponse {
  issues: Issue[];
  backendMode: string;
}

interface FixWebhookResponse {
  action: 'created' | 'updated';
  endpointId: string;
  url: string;
  events: string[];
  secret: string | null;
  message: string;
}

interface SyncPricesResponse {
  monthly: Array<{ id: string; nickname: string | null; productName: string; amount: number; currency: string }>;
  yearly: Array<{ id: string; nickname: string | null; productName: string; amount: number; currency: string }>;
  suggested: { monthly: string | null; yearly: string | null };
  envSnippet: string | null;
  message: string;
}

interface CreateRecurringPricesResponse {
  mode: 'test' | 'live';
  productId: string;
  productName: string;
  productAction: 'reused' | 'created';
  monthly: { id: string; unit_amount: number; currency: string; active: boolean; nickname: string };
  yearly: { id: string; unit_amount: number; currency: string; active: boolean; nickname: string };
  replaced: { monthly: string | null; yearly: string | null };
  envSnippet: string;
  message: string;
}


const DEFAULT_WEBHOOK_URL =
  'https://erbligiwkdfwxkhvwepw.functions.databasepad.com/stripe-webhook';

function severityIcon(sev: Issue['severity']) {
  if (sev === 'error') return <XCircle className="h-5 w-5 text-red-600 shrink-0" />;
  if (sev === 'warning') return <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />;
  return <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0" />;
}

function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
    >
      <Copy className="h-3 w-3" />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function StripeAutoFixPanel() {
  const [scanning, setScanning] = useState(false);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixResults, setFixResults] = useState<Record<string, { ok: boolean; message: string; details?: any }>>({});
  const [webhookUrl, setWebhookUrl] = useState<string>(DEFAULT_WEBHOOK_URL);
  const [syncResult, setSyncResult] = useState<SyncPricesResponse | null>(null);
  const [autoScanned, setAutoScanned] = useState(false);

  const runScan = async () => {
    setScanning(true);
    setScanError(null);
    setIssues(null);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-autofix', {
        body: {
          action: 'detect',
          frontendMode: STRIPE_MODE,
          monthlyPriceId: STRIPE_PRICE_MONTHLY,
          yearlyPriceId: STRIPE_PRICE_YEARLY,
          webhookUrl,
        },
      });
      if (error) throw error;
      const resp = data as DetectResponse;
      setIssues(resp.issues || []);
    } catch (err) {
      setScanError((err as Error).message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  // Auto-run the scan once when the panel mounts so the user doesn't have to
  // click "Scan for issues" — results appear immediately.
  useEffect(() => {
    if (autoScanned) return;
    setAutoScanned(true);
    void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const runFix = async (issue: Issue) => {
    if (!issue.fixable || !issue.fixAction || issue.fixAction === 'manual') return;
    setFixingId(issue.id);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-autofix', {
        body: {
          action: issue.fixAction,
          webhookUrl,
          monthlyPriceId: STRIPE_PRICE_MONTHLY,
          yearlyPriceId: STRIPE_PRICE_YEARLY,
        },
      });
      if (error) throw error;

      if (issue.fixAction === 'fix-webhook') {
        const r = data as FixWebhookResponse;
        setFixResults((prev) => ({
          ...prev,
          [issue.id]: { ok: true, message: r.message, details: r },
        }));
      } else if (issue.fixAction === 'sync-prices') {
        const r = data as SyncPricesResponse;
        setSyncResult(r);
        setFixResults((prev) => ({
          ...prev,
          [issue.id]: { ok: true, message: r.message, details: r },
        }));
      } else if (issue.fixAction === 'create-recurring-prices') {
        const r = data as CreateRecurringPricesResponse;
        setFixResults((prev) => ({
          ...prev,
          [issue.id]: { ok: true, message: r.message, details: r },
        }));
      }
    } catch (err) {
      setFixResults((prev) => ({
        ...prev,
        [issue.id]: { ok: false, message: (err as Error).message },
      }));
    } finally {
      setFixingId(null);
    }
  };


  const errorCount = issues?.filter((i) => i.severity === 'error').length ?? 0;
  const warningCount = issues?.filter((i) => i.severity === 'warning').length ?? 0;

  return (
    <>
    <Card className="border-2 border-indigo-200 dark:border-indigo-900 bg-gradient-to-br from-indigo-50/50 to-purple-50/30 dark:from-indigo-950/20 dark:to-purple-950/10 mb-6">

      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Wrench className="h-4 w-4 text-white" />
              </div>
              Auto-fix
              <Badge variant="secondary" className="ml-1">
                <Sparkles className="h-3 w-3 mr-1" />
                One-click
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Scans your Stripe account for common misconfigurations (mode mismatch, missing
              webhook events, archived/wrong-interval prices) and fixes them with a single click —
              including minting fresh active recurring prices when yours are broken.
            </CardDescription>

          </div>
          <Button onClick={runScan} disabled={scanning}>
            {scanning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" /> Scan for issues
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Webhook URL config (used by both detect + fix-webhook) */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 p-3">
          <Label htmlFor="autofix-webhook-url" className="text-xs font-semibold">
            Webhook URL (the public URL of your stripe-webhook edge function)
          </Label>
          <div className="flex gap-2 mt-1.5">
            <Input
              id="autofix-webhook-url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="font-mono text-xs"
              placeholder="https://....functions.databasepad.com/stripe-webhook"
            />
            <CopyInline text={webhookUrl} />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Auto-fix will create or update a Stripe webhook endpoint pointing at this URL.
          </p>
        </div>

        {/* Daily scheduled scan + notifications */}
        <StripeAutoFixScheduleSection />

        {/* Initial state */}
        {issues === null && !scanning && !scanError && (
          <div className="rounded-lg border-2 border-dashed border-indigo-200 dark:border-indigo-900 p-6 text-center">
            <Sparkles className="h-8 w-8 text-indigo-500 mx-auto mb-2" />
            <p className="text-sm font-medium">Click "Scan for issues" to start</p>
            <p className="text-xs text-slate-500 mt-1">
              We'll check your Stripe account, webhook events, price intervals, and more.
            </p>
          </div>
        )}

        {scanError && (
          <Alert className="border-red-300 bg-red-50 dark:bg-red-950/30">
            <XCircle className="h-4 w-4 text-red-600" />
            <AlertTitle>Scan failed</AlertTitle>
            <AlertDescription className="text-xs">{scanError}</AlertDescription>
          </Alert>
        )}

        {/* Results summary */}
        {issues && issues.length === 0 && !scanning && (
          <Alert className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <AlertTitle>No issues detected</AlertTitle>
            <AlertDescription>
              Your Stripe configuration looks healthy. All checks passed.
            </AlertDescription>
          </Alert>
        )}

        {issues && issues.length > 0 && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              {errorCount > 0 && (
                <Badge variant="destructive">
                  {errorCount} error{errorCount === 1 ? '' : 's'}
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge className="bg-amber-500 hover:bg-amber-500">
                  {warningCount} warning{warningCount === 1 ? '' : 's'}
                </Badge>
              )}
              <span className="text-xs text-slate-500">
                {issues.filter((i) => i.fixable).length} fixable automatically
              </span>
            </div>

            <div className="space-y-3">
              {issues.map((issue) => {
                const result = fixResults[issue.id];
                const isFixing = fixingId === issue.id;
                return (
                  <div
                    key={issue.id}
                    className={`rounded-lg border p-4 ${
                      issue.severity === 'error'
                        ? 'border-red-200 bg-red-50/40 dark:bg-red-950/20'
                        : issue.severity === 'warning'
                        ? 'border-amber-200 bg-amber-50/40 dark:bg-amber-950/20'
                        : 'border-blue-200 bg-blue-50/40 dark:bg-blue-950/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {severityIcon(issue.severity)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h4 className="font-semibold text-sm">{issue.title}</h4>
                          {issue.fixable && (
                            <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-700 dark:text-emerald-400">
                              Auto-fixable
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                          {issue.description}
                        </p>

                        {issue.manualSteps && issue.manualSteps.length > 0 && (
                          <ol className="list-decimal list-inside text-xs text-slate-700 dark:text-slate-300 space-y-1 ml-1 bg-white/60 dark:bg-slate-900/40 p-2 rounded">
                            {issue.manualSteps.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ol>
                        )}

                        {issue.fixable && issue.fixAction !== 'manual' && (
                          <Button
                            size="sm"
                            onClick={() => {
                              if (issue.fixAction === 'clone-prices') {
                                // Mode mismatch is fixed via the side-by-side
                                // compare panel below — scroll to it.
                                const el = document.getElementById('stripe-mode-compare');
                                if (el) {
                                  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  el.classList.add('ring-4', 'ring-purple-400');
                                  setTimeout(() => {
                                    el.classList.remove('ring-4', 'ring-purple-400');
                                  }, 2000);
                                }
                                return;
                              }
                              runFix(issue);
                            }}
                            disabled={isFixing || !!result?.ok}
                            className="mt-2"
                          >
                            {isFixing ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Fixing…
                              </>
                            ) : result?.ok ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 mr-1.5" /> Fixed
                              </>
                            ) : (
                              <>
                                <Wrench className="h-3 w-3 mr-1.5" />
                                {issue.fixAction === 'fix-webhook'
                                  ? 'Auto-create / update webhook'
                                  : issue.fixAction === 'clone-prices'
                                  ? 'Open compare & clone panel ↓'
                                  : issue.fixAction === 'create-recurring-prices'
                                  ? 'Create matching active recurring prices'
                                  : 'Sync prices from Stripe'}
                              </>
                            )}
                          </Button>
                        )}


                        {result && (
                          <div
                            className={`mt-3 p-2 rounded text-xs ${
                              result.ok
                                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                                : 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300'
                            }`}
                          >
                            <div className="font-medium">
                              {result.ok ? 'Success' : 'Failed'}: {result.message}
                            </div>

                            {/* Webhook fix details */}
                            {result.ok && issue.fixAction === 'fix-webhook' && result.details?.secret && (
                              <div className="mt-2 p-2 bg-slate-900 text-slate-100 rounded font-mono text-[11px]">
                                <div className="text-amber-300 mb-1">
                                  ⚠ Copy this signing secret into STRIPE_WEBHOOK_SECRET (Edge Function Secrets) — it will not be shown again:
                                </div>
                                <div className="flex items-center gap-2">
                                  <code className="flex-1 break-all">{result.details.secret}</code>
                                  <CopyInline text={result.details.secret} />
                                </div>
                              </div>
                            )}

                            {/* Price sync details */}
                            {result.ok && issue.fixAction === 'sync-prices' && syncResult?.envSnippet && (
                              <div className="mt-2 p-2 bg-slate-900 text-slate-100 rounded font-mono text-[11px]">
                                <div className="text-emerald-300 mb-1">
                                  Suggested values for your .env (restart dev server after pasting):
                                </div>
                                <div className="flex items-start gap-2">
                                  <pre className="flex-1 whitespace-pre-wrap break-all">{syncResult.envSnippet}</pre>
                                  <CopyInline text={syncResult.envSnippet} />
                                </div>
                              </div>
                            )}

                            {/* Show all available prices when sync ran */}
                            {result.ok && issue.fixAction === 'sync-prices' && syncResult && (
                              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                <PriceList title="Monthly" prices={syncResult.monthly} />
                                <PriceList title="Yearly" prices={syncResult.yearly} />
                              </div>
                            )}

                            {/* Create-recurring-prices details */}
                            {result.ok && issue.fixAction === 'create-recurring-prices' && result.details && (
                              <CreatedPricesPanel details={result.details as CreateRecurringPricesResponse} />
                            )}
                          </div>
                        )}

                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>

    {/* Side-by-side test vs live comparison + one-click clone of missing prices */}
    <div id="stripe-mode-compare" className="rounded-lg transition-shadow">
      <StripeModeCompareCard />
    </div>
    </>
  );
}


function PriceList({
  title,
  prices,
}: {
  title: string;
  prices: Array<{ id: string; nickname: string | null; productName: string; amount: number; currency: string }>;
}) {
  return (
    <div className="bg-white/80 dark:bg-slate-900/60 rounded p-2 text-slate-800 dark:text-slate-200 text-[11px]">
      <div className="font-semibold mb-1">{title} prices ({prices.length})</div>
      {prices.length === 0 ? (
        <div className="text-slate-500 italic">None found</div>
      ) : (
        <ul className="space-y-1">
          {prices.slice(0, 5).map((p) => (
            <li key={p.id} className="flex items-center gap-1">
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{p.id}</code>
              <span>— {p.productName} — {p.amount} {p.currency.toUpperCase()}</span>
              <CopyInline text={p.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Verification: after the auto-fix mints new prices, immediately try to create
// a real Stripe Checkout Session against each one to prove they actually work
// end-to-end (same call path as E2ECheckoutTest, but parameterized by the
// freshly-minted price IDs instead of the env-var ones).
// ----------------------------------------------------------------------------
type VerifyState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'pass'; sessionId: string | null; url: string | null; durationMs: number }
  | { status: 'fail'; error: string; rawStatus: number | null; rawBody: any; durationMs: number };

async function verifyPriceWithCheckoutSession(
  plan: 'monthly' | 'yearly',
  priceId: string,
): Promise<VerifyState> {
  const t0 = performance.now();
  const successUrl = `${window.location.origin}/checkout/success?verify=success&plan=${plan}`;
  const cancelUrl = `${window.location.origin}/admin/stripe-setup?verify=cancelled&plan=${plan}`;
  const requestBody = {
    plan,
    priceId,
    mode: 'subscription',
    quantity: 1,
    testMode: true,
    successUrl,
    cancelUrl,
    debug: true,
  };

  try {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: requestBody,
    });

    let rawStatus: number | null = null;
    let rawBody: any = null;
    let rawText: string | null = null;

    if (error) {
      const ctx: any = (error as any)?.context;
      try {
        if (ctx && typeof ctx.text === 'function') {
          rawStatus = ctx.status ?? null;
          rawText = await ctx.text();
          try {
            rawBody = rawText ? JSON.parse(rawText) : null;
          } catch {
            rawBody = { raw: rawText };
          }
        }
      } catch {
        // ignore
      }

      // Fallback: direct fetch so we always surface the real Stripe error.
      if (!rawBody) {
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
            rawBody = rawText ? JSON.parse(rawText) : null;
          } catch {
            rawBody = { raw: rawText };
          }
        } catch (fetchErr) {
          rawBody = { fetchFallbackError: String(fetchErr) };
        }
      }

      const msg =
        (rawBody && (rawBody.error || rawBody.message || rawBody.msg || rawBody.raw)) ||
        rawText ||
        error.message ||
        'Edge function returned a non-2xx status';
      return {
        status: 'fail',
        error: typeof msg === 'string' ? msg : JSON.stringify(msg),
        rawStatus,
        rawBody,
        durationMs: Math.round(performance.now() - t0),
      };
    }

    const url: string | null = data?.url ?? null;
    const sessionId: string | null = data?.sessionId ?? data?.id ?? null;

    // A "pass" requires BOTH a cs_... session id AND a checkout.stripe.com URL.
    if (!sessionId || !sessionId.startsWith('cs_')) {
      return {
        status: 'fail',
        error: `Edge function did not return a valid Stripe session id (got ${
          sessionId ? `"${sessionId}"` : 'null'
        })`,
        rawStatus: 200,
        rawBody: data,
        durationMs: Math.round(performance.now() - t0),
      };
    }
    if (!url) {
      return {
        status: 'fail',
        error: 'Edge function returned a session id but no checkout URL',
        rawStatus: 200,
        rawBody: data,
        durationMs: Math.round(performance.now() - t0),
      };
    }
    try {
      const host = new URL(url).hostname;
      if (host !== 'checkout.stripe.com' && !host.endsWith('.stripe.com')) {
        return {
          status: 'fail',
          error: `Returned URL host is "${host}" — expected checkout.stripe.com`,
          rawStatus: 200,
          rawBody: data,
          durationMs: Math.round(performance.now() - t0),
        };
      }
    } catch {
      return {
        status: 'fail',
        error: 'Returned URL is not a valid URL',
        rawStatus: 200,
        rawBody: data,
        durationMs: Math.round(performance.now() - t0),
      };
    }

    return {
      status: 'pass',
      sessionId,
      url,
      durationMs: Math.round(performance.now() - t0),
    };
  } catch (err: any) {
    return {
      status: 'fail',
      error: err?.message || String(err),
      rawStatus: null,
      rawBody: null,
      durationMs: Math.round(performance.now() - t0),
    };
  }
}

function VerifyBadge({ state }: { state: VerifyState }) {
  if (state.status === 'idle') {
    return (
      <Badge variant="outline" className="text-[10px] text-slate-500">
        Not verified
      </Badge>
    );
  }
  if (state.status === 'running') {
    return (
      <Badge variant="secondary" className="text-[10px]">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Verifying…
      </Badge>
    );
  }
  if (state.status === 'pass') {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px]">
        <ShieldCheck className="h-3 w-3 mr-1" />
        Verified
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px]">
      <XCircle className="h-3 w-3 mr-1" />
      Verification failed
    </Badge>
  );
}

function VerifyResultCard({
  plan,
  priceId,
  state,
  onRetry,
}: {
  plan: 'monthly' | 'yearly';
  priceId: string;
  state: VerifyState;
  onRetry: () => void;
}) {
  if (state.status === 'idle' || state.status === 'running') return null;

  if (state.status === 'pass') {
    return (
      <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-2 text-[11px] text-emerald-800 dark:text-emerald-200 space-y-1">
        <div className="flex items-center gap-1.5 font-semibold">
          <ShieldCheck className="h-3.5 w-3.5" />
          Verified — Stripe accepted this price and created a real Checkout Session ({state.durationMs}ms)
        </div>
        {state.sessionId && (
          <div className="font-mono">
            Session: <code className="bg-white/70 dark:bg-slate-900/60 px-1 rounded">{state.sessionId}</code>
          </div>
        )}
        {state.url && (
          <a
            href={state.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Open hosted checkout (test purchase)
          </a>
        )}
      </div>
    );
  }

  // fail
  return (
    <div className="mt-2 rounded border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-2 text-[11px] text-red-800 dark:text-red-200 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold">
          <XCircle className="h-3.5 w-3.5" />
          Verification failed for the new {plan} price
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px] border-red-300 text-red-700 dark:text-red-300"
          onClick={onRetry}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
      <div className="font-mono break-words">
        Price <code className="bg-white/70 dark:bg-slate-900/60 px-1 rounded">{priceId}</code>
      </div>
      <div className="font-mono whitespace-pre-wrap break-words">
        Stripe error: {state.error}
      </div>
      {(state.rawStatus !== null || state.rawBody) && (
        <details className="font-mono">
          <summary className="cursor-pointer select-none">
            Raw HTTP response{state.rawStatus ? ` · status ${state.rawStatus}` : ''}
          </summary>
          <pre className="mt-1 whitespace-pre-wrap break-all max-h-40 overflow-auto bg-slate-900 text-slate-100 p-2 rounded">
{JSON.stringify({ status: state.rawStatus, body: state.rawBody }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function CreatedPricesPanel({ details }: { details: CreateRecurringPricesResponse }) {
  const fmt = (cents: number, currency: string) =>
    `$${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;

  const [verify, setVerify] = useState<{ monthly: VerifyState; yearly: VerifyState }>({
    monthly: { status: 'idle' },
    yearly: { status: 'idle' },
  });

  const runVerify = async (plan: 'monthly' | 'yearly') => {
    const priceId = plan === 'monthly' ? details.monthly.id : details.yearly.id;
    setVerify((prev) => ({ ...prev, [plan]: { status: 'running' } }));
    const result = await verifyPriceWithCheckoutSession(plan, priceId);
    setVerify((prev) => ({ ...prev, [plan]: result }));
  };

  // Auto-trigger verification as soon as the panel mounts (i.e. as soon as
  // the auto-fix reports successful price creation).
  useEffect(() => {
    void runVerify('monthly');
    void runVerify('yearly');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details.monthly.id, details.yearly.id]);

  const bothPass =
    verify.monthly.status === 'pass' && verify.yearly.status === 'pass';
  const anyFail =
    verify.monthly.status === 'fail' || verify.yearly.status === 'fail';
  const anyRunning =
    verify.monthly.status === 'running' || verify.yearly.status === 'running';

  return (
    <div className="mt-2 space-y-2">
      <div className="rounded bg-slate-900 text-slate-100 p-2 font-mono text-[11px]">
        <div className="text-emerald-300 mb-1">
          New active recurring prices created in {details.mode.toUpperCase()} mode — paste into .env and restart dev server:
        </div>
        <div className="flex items-start gap-2">
          <pre className="flex-1 whitespace-pre-wrap break-all">{details.envSnippet}</pre>
          <CopyInline text={details.envSnippet} />
        </div>
      </div>

      {/* End-to-end verification banner */}
      <div
        className={`rounded border p-2 text-[11px] flex items-center justify-between gap-2 flex-wrap ${
          bothPass
            ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
            : anyFail
            ? 'border-red-300 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
            : 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-200'
        }`}
      >
        <div className="flex items-center gap-1.5 font-semibold">
          {bothPass ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : anyFail ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}
          {bothPass
            ? 'End-to-end verification passed — both new prices create valid Stripe Checkout Sessions'
            : anyFail
            ? 'End-to-end verification failed for one or more prices — see details below'
            : anyRunning
            ? 'Verifying new prices against /v1/checkout/sessions…'
            : 'Verification queued'}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          onClick={() => {
            void runVerify('monthly');
            void runVerify('yearly');
          }}
          disabled={anyRunning}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Re-verify both
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
        <div className="bg-white/80 dark:bg-slate-900/60 rounded p-2 text-slate-800 dark:text-slate-200">
          <div className="font-semibold mb-1 flex items-center justify-between gap-1">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Monthly
            </span>
            <VerifyBadge state={verify.monthly} />
          </div>
          <div className="flex items-center gap-1 mb-0.5">
            <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{details.monthly.id}</code>
            <CopyInline text={details.monthly.id} />
          </div>
          <div className="text-slate-500">
            {fmt(details.monthly.unit_amount, details.monthly.currency)} / month
          </div>
          {details.replaced.monthly && (
            <div className="text-amber-600 dark:text-amber-400 mt-1">
              Replaces broken: <code>{details.replaced.monthly}</code>
            </div>
          )}
          <VerifyResultCard
            plan="monthly"
            priceId={details.monthly.id}
            state={verify.monthly}
            onRetry={() => void runVerify('monthly')}
          />
        </div>
        <div className="bg-white/80 dark:bg-slate-900/60 rounded p-2 text-slate-800 dark:text-slate-200">
          <div className="font-semibold mb-1 flex items-center justify-between gap-1">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Yearly
            </span>
            <VerifyBadge state={verify.yearly} />
          </div>
          <div className="flex items-center gap-1 mb-0.5">
            <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{details.yearly.id}</code>
            <CopyInline text={details.yearly.id} />
          </div>
          <div className="text-slate-500">
            {fmt(details.yearly.unit_amount, details.yearly.currency)} / year
          </div>
          {details.replaced.yearly && (
            <div className="text-amber-600 dark:text-amber-400 mt-1">
              Replaces broken: <code>{details.replaced.yearly}</code>
            </div>
          )}
          <VerifyResultCard
            plan="yearly"
            priceId={details.yearly.id}
            state={verify.yearly}
            onRetry={() => void runVerify('yearly')}
          />
        </div>
      </div>

      <div className="text-[11px] text-slate-600 dark:text-slate-400">
        Product <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{details.productId}</code>
        {' '}({details.productAction === 'created' ? 'newly created' : 'reused existing'}) — name: <span className="font-medium">{details.productName}</span>
      </div>
    </div>
  );
}
