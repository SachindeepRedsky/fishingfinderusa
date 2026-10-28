import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DetectedIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  fixAction?: string;
  fixable?: boolean;
}

interface DetectResponse {
  issues?: DetectedIssue[];
  errorCount?: number;
  warningCount?: number;
  error?: string;
}

/**
 * Auto-runs the `stripe-autofix` detect action on mount and shows a clear
 * pass/fail banner. This is the FIRST thing a user sees on the checkout page
 * after adding their Stripe secrets — it tells them in plain English whether
 * their setup is now valid, so they don't have to attempt a checkout and
 * decode a cryptic 500 error.
 *
 * NOTE: All Tailwind classes are written as static strings (no template
 * interpolation in class names) so the JIT compiler picks them up.
 */
const CheckoutHealthCheck: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<DetectedIssue[] | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-autofix', {
        body: { action: 'detect' },
      });
      if (error) {
        let real = error.message || 'Detect call failed';
        try {
          const supabaseUrl = (supabase as any).supabaseUrl as string;
          const anonKey = (supabase as any).supabaseKey as string;
          const fnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/stripe-autofix`;
          const sess = await supabase.auth.getSession();
          const token = sess.data.session?.access_token || anonKey;
          const r = await fetch(fnUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: anonKey,
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ action: 'detect' }),
          });
          const txt = await r.text();
          try {
            const j = JSON.parse(txt);
            real = j?.error || j?.message || txt.slice(0, 300);
          } catch {
            real = txt.slice(0, 300) || real;
          }
        } catch {
          /* ignore */
        }
        setFetchError(real);
        setIssues(null);
      } else {
        const resp = (data || {}) as DetectResponse;
        const list = resp.issues || [];
        setIssues(list);
        setErrorCount(
          resp.errorCount ?? list.filter((i) => i.severity === 'error').length,
        );
        setWarningCount(
          resp.warningCount ?? list.filter((i) => i.severity === 'warning').length,
        );
      }
      setLastRun(new Date());
    } catch (err: any) {
      setFetchError(err?.message || 'Could not reach the diagnostic function.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  // ---- Loading ----
  if (loading && !issues && !fetchError) {
    return (
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6 flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-blue-300 animate-spin flex-shrink-0" />
        <div className="text-sm">
          <p className="text-blue-200 font-medium">Verifying your Stripe setup…</p>
          <p className="text-blue-300/70 text-xs">
            Checking that your secret key, prices, and webhooks are configured.
          </p>
        </div>
      </div>
    );
  }

  // ---- Diagnostic itself failed (function not reachable / threw) ----
  if (fetchError) {
    const lower = fetchError.toLowerCase();
    const isMissingSecret =
      lower.includes('stripe_secret_key') || lower.includes('not configured');
    return (
      <div className="bg-red-500/10 border-2 border-red-500/40 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3 mb-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="text-red-200 font-semibold text-sm">
              Stripe diagnostic could not run
            </h4>
            <p className="text-red-100/90 text-xs mt-1 break-words">{fetchError}</p>
            {isMissingSecret && (
              <p className="text-red-100/80 text-xs mt-2">
                The <code className="font-mono bg-red-500/20 px-1 rounded">STRIPE_SECRET_KEY</code>{' '}
                secret still isn't reaching the edge function. After saving a
                secret in Supabase, edge functions sometimes need ~30 seconds
                to pick it up. Wait a moment and click <strong>Re-check now</strong>.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={runCheck}
            className="bg-red-500 hover:bg-red-600 text-white text-xs h-8"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Re-check now
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/admin/stripe-setup')}

            className="border-red-500/40 text-red-200 hover:bg-red-500/10 text-xs h-8"
          >
            Open full Stripe Setup page
          </Button>
        </div>
      </div>
    );
  }

  const hasErrors = errorCount > 0;
  const hasWarnings = warningCount > 0;
  const allGood = !hasErrors && !hasWarnings;

  // ---- All good ----
  if (allGood) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-green-200 font-semibold text-sm">
            Your Stripe setup looks good — checkout is ready to go.
          </p>
          <p className="text-green-300/70 text-xs mt-0.5">
            Secret key accepted, prices found, webhook configured. Click{' '}
            <strong>Continue to Secure Checkout</strong> below to test it.
            {lastRun && (
              <span className="ml-1 opacity-70">
                Verified at {lastRun.toLocaleTimeString()}.
              </span>
            )}
          </p>
        </div>
        <button
          onClick={runCheck}
          className="text-green-300/70 hover:text-green-200 text-xs flex items-center gap-1 flex-shrink-0"
          disabled={loading}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Re-check
        </button>
      </div>
    );
  }

  // ---- Has errors or warnings ----
  const useRed = hasErrors;
  const visibleIssues = expanded ? issues || [] : (issues || []).slice(0, 3);

  const wrapperClass = useRed
    ? 'bg-red-500/10 border-2 border-red-500/40 rounded-xl p-4 mb-6'
    : 'bg-amber-500/10 border-2 border-amber-500/40 rounded-xl p-4 mb-6';
  const titleClass = useRed
    ? 'text-red-200 font-semibold text-sm'
    : 'text-amber-200 font-semibold text-sm';
  const subTextClass = useRed
    ? 'text-red-100/80 text-xs mt-1'
    : 'text-amber-100/80 text-xs mt-1';
  const iconClass = useRed
    ? 'w-5 h-5 text-red-400 flex-shrink-0 mt-0.5'
    : 'w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5';
  const primaryBtnClass = useRed
    ? 'bg-red-500 hover:bg-red-600 text-white text-xs h-8'
    : 'bg-amber-500 hover:bg-amber-600 text-white text-xs h-8';
  const outlineBtnClass = useRed
    ? 'border-red-500/40 text-red-200 hover:bg-red-500/10 text-xs h-8 bg-inherit'
    : 'border-amber-500/40 text-amber-200 hover:bg-amber-500/10 text-xs h-8 bg-inherit';
  const expandBtnClass = useRed
    ? 'text-red-200 hover:text-white text-xs flex items-center gap-1 mb-3'
    : 'text-amber-200 hover:text-white text-xs flex items-center gap-1 mb-3';
  const tsClass = useRed
    ? 'text-red-300/60 text-[10px] mt-3'
    : 'text-amber-300/60 text-[10px] mt-3';

  return (
    <div className={wrapperClass}>
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className={iconClass} />
        <div className="flex-1 min-w-0">
          <h4 className={titleClass}>
            {hasErrors
              ? `Checkout is blocked — ${errorCount} issue${errorCount === 1 ? '' : 's'} still need${errorCount === 1 ? 's' : ''} fixing`
              : `Checkout may work, but ${warningCount} warning${warningCount === 1 ? '' : 's'} detected`}
          </h4>
          <p className={subTextClass}>
            We just ran a live diagnostic against your Stripe account. Here's
            what's still wrong:
          </p>
        </div>
      </div>

      <ul className="space-y-2 mb-3">
        {visibleIssues.map((iss) => {
          const isErr = iss.severity === 'error';
          const liClass = isErr
            ? 'bg-red-500/10 border border-red-500/30 rounded p-2.5'
            : 'bg-amber-500/10 border border-amber-500/30 rounded p-2.5';
          const liTitle = isErr
            ? 'text-red-200 font-medium text-xs'
            : 'text-amber-200 font-medium text-xs';
          const liMsg = isErr
            ? 'text-red-100/80 text-xs mt-0.5 break-words'
            : 'text-amber-100/80 text-xs mt-0.5 break-words';
          return (
            <li key={iss.id} className={liClass}>
              <p className={liTitle}>{iss.title}</p>
              <p className={liMsg}>{iss.message}</p>
            </li>
          );
        })}
      </ul>

      {(issues || []).length > 3 && (
        <button onClick={() => setExpanded((v) => !v)} className={expandBtnClass}>
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3" /> Show fewer
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" /> Show {(issues || []).length - 3} more
            </>
          )}
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => navigate('/admin/stripe-setup')} className={primaryBtnClass}>
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open Stripe Setup &amp; Auto-fix
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={runCheck}
          disabled={loading}
          className={outlineBtnClass}
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Re-check now
        </Button>
      </div>

      {lastRun && (
        <p className={tsClass}>Last checked at {lastRun.toLocaleTimeString()}.</p>
      )}
    </div>
  );
};

export default CheckoutHealthCheck;
