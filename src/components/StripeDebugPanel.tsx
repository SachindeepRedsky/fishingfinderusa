import React, { useState } from 'react';
import {
  STRIPE_CONFIG_VALID,
  STRIPE_CONFIG_ERROR,
  STRIPE_MODE,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  STRIPE_ACCOUNT_ID,
  PLANS,
} from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Bug, CheckCircle2, XCircle, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, Copy, Eye, EyeOff,
} from 'lucide-react';

interface TestResult {
  plan: 'monthly' | 'yearly';
  status: 'pending' | 'success' | 'error';
  message: string;
  payload?: any;
  timestamp: string;
}



const maskKey = (key: string, show: boolean) => {
  if (!key) return '(empty)';
  if (show) return key;
  if (key.length <= 12) return key;
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
};

const StatusRow: React.FC<{
  label: string;
  ok: boolean | null;
  value: React.ReactNode;
}> = ({ label, ok, value }) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-700/50 last:border-0">
    <div className="flex items-center gap-2 min-w-[180px]">
      {ok === true && <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />}
      {ok === false && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
      {ok === null && <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />}
      <span className="text-sm text-gray-300">{label}</span>
    </div>
    <div className="text-sm text-gray-100 font-mono break-all text-right">{value}</div>
  </div>
);

const StripeDebugPanel: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [testing, setTesting] = useState<'monthly' | 'yearly' | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);

  const pkOk =
    !!STRIPE_PUBLISHABLE_KEY &&
    (STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_') ||
      STRIPE_PUBLISHABLE_KEY.startsWith('pk_live_')) &&
    STRIPE_PUBLISHABLE_KEY.length >= 50;

  const monthlyOk =
    !!STRIPE_PRICE_MONTHLY &&
    STRIPE_PRICE_MONTHLY.startsWith('price_') &&
    !STRIPE_PRICE_MONTHLY.includes('REPLACE_WITH');
  const yearlyOk =
    !!STRIPE_PRICE_YEARLY &&
    STRIPE_PRICE_YEARLY.startsWith('price_') &&
    !STRIPE_PRICE_YEARLY.includes('REPLACE_WITH');

  const copy = (txt: string) => {
    navigator.clipboard?.writeText(txt).catch(() => {});
  };

  const runTestCheckout = async (plan: 'monthly' | 'yearly') => {
    setTesting(plan);
    const startedAt = new Date().toISOString();
    const priceId = PLANS[plan].priceId;

    // eslint-disable-next-line no-console
    console.group(`[Stripe Debug] Test Checkout — ${plan}`);
    // eslint-disable-next-line no-console
    console.log('priceId:', priceId);
    // eslint-disable-next-line no-console
    console.log('mode:', STRIPE_MODE);

    try {
      const { data, error } = await supabase.functions.invoke(
        'create-checkout-session',
        {
          body: {
            plan,
            priceId,
            successUrl: `${window.location.origin}/checkout/success?plan=${plan}&debug=1`,
            cancelUrl: `${window.location.origin}/pricing?debug=1&cancelled=1`,
            debug: true,
          },
        }
      );

      if (error) {
        // eslint-disable-next-line no-console
        console.error('Edge function error:', error);
        setResults((r) => [
          {
            plan,
            status: 'error',
            message: error.message || 'Edge function returned an error',
            payload: error,
            timestamp: startedAt,
          },
          ...r,
        ]);
      } else {
        // eslint-disable-next-line no-console
        console.log('Response payload:', data);
        const ok = !!(data && (data.url || data.sessionId || data.id));
        setResults((r) => [
          {
            plan,
            status: ok ? 'success' : 'error',
            message: ok
              ? `Session created${data.url ? ` — URL: ${data.url}` : ''}`
              : (data?.message || data?.error || 'Edge function returned no session URL/id'),
            payload: data,
            timestamp: startedAt,
          },
          ...r,
        ]);
      }


    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Unexpected error:', err);
      setResults((r) => [
        {
          plan,
          status: 'error',
          message: err?.message || 'Unexpected error',
          payload: { error: String(err) },
          timestamp: startedAt,
        },
        ...r,
      ]);
    } finally {
      // eslint-disable-next-line no-console
      console.groupEnd();
      setTesting(null);
    }
  };

  const overallOk = STRIPE_CONFIG_VALID && pkOk && monthlyOk && yearlyOk;

  return (
    <div className="hidden lg:block max-w-5xl mx-auto px-4 mb-8">
      <div className="bg-slate-950/90 border-2 border-amber-500/40 rounded-2xl shadow-xl shadow-amber-500/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <Bug className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                Stripe Debug Panel
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide ${
                    STRIPE_MODE === 'live'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                      : STRIPE_MODE === 'test'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-slate-600/30 text-gray-300 border border-slate-500/40'
                  }`}
                >
                  {STRIPE_MODE.toUpperCase()}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide w-[100px] md:w- ${
                    overallOk
                      ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                      : 'bg-red-500/20 text-red-300 border border-red-500/40'
                  }`}
                >
                  {overallOk ? 'CONFIG OK' : 'CONFIG ISSUE'}
                </span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Visible only in dev mode or with{' '}
                <code className="text-amber-300">?debug=1</code>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSecrets((s) => !s)}
              className="text-gray-300 hover:text-white"
              title={showSecrets ? 'Hide full keys' : 'Show full keys'}
            >
              {showSecrets ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed((c) => !c)}
              className="text-gray-300 hover:text-white"
            >
              {collapsed ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {!collapsed && (
          <div className="p-5 space-y-5">
            {/* Validation banner */}
            {!STRIPE_CONFIG_VALID && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-200">{STRIPE_CONFIG_ERROR}</p>
              </div>
            )}

            {/* Status grid */}
            <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
              <h4 className="text-white font-semibold text-sm mb-2">
                Configuration
              </h4>
              <StatusRow
                label="Publishable Key"
                ok={pkOk}
                value={
                  <span className="inline-flex items-center gap-2">
                    <span>{maskKey(STRIPE_PUBLISHABLE_KEY, showSecrets)}</span>
                    {STRIPE_PUBLISHABLE_KEY && (
                      <button
                        onClick={() => copy(STRIPE_PUBLISHABLE_KEY)}
                        className="text-gray-500 hover:text-gray-200"
                        title="Copy"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                }
              />
              <StatusRow
                label="Mode"
                ok={STRIPE_MODE !== 'unknown'}
                value={
                  <span
                    className={
                      STRIPE_MODE === 'live'
                        ? 'text-red-300'
                        : STRIPE_MODE === 'test'
                        ? 'text-blue-300'
                        : 'text-amber-300'
                    }
                  >
                    {STRIPE_MODE}
                  </span>
                }
              />
              <StatusRow
                label="Key length"
                ok={pkOk}
                value={`${STRIPE_PUBLISHABLE_KEY.length} chars`}
              />
              <StatusRow
                label="Monthly price ID"
                ok={monthlyOk}
                value={
                  <span className="inline-flex items-center gap-2">
                    <span>{STRIPE_PRICE_MONTHLY || '(empty)'}</span>
                    {STRIPE_PRICE_MONTHLY && (
                      <button
                        onClick={() => copy(STRIPE_PRICE_MONTHLY)}
                        className="text-gray-500 hover:text-gray-200"
                        title="Copy"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                }
              />
              <StatusRow
                label="Yearly price ID"
                ok={yearlyOk}
                value={
                  <span className="inline-flex items-center gap-2">
                    <span>{STRIPE_PRICE_YEARLY || '(empty)'}</span>
                    {STRIPE_PRICE_YEARLY && (
                      <button
                        onClick={() => copy(STRIPE_PRICE_YEARLY)}
                        className="text-gray-500 hover:text-gray-200"
                        title="Copy"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                }
              />
              {STRIPE_ACCOUNT_ID && (
                <StatusRow
                  label="Connect account"
                  ok={true}
                  value={STRIPE_ACCOUNT_ID}
                />
              )}
              <StatusRow
                label="Edge function"
                ok={null}
                value={
                  <span className="text-gray-400">
                    create-checkout-session (verify with test below)
                  </span>
                }
              />
            </div>

            {/* Test Checkout */}
            <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h4 className="text-white font-semibold text-sm">
                    End-to-end Test Checkout
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Calls the <code className="text-amber-300">create-checkout-session</code>{' '}
                    edge function with each price ID. Logs the full response to
                    the browser console — no real card needed.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <Button
                  onClick={() => runTestCheckout('monthly')}
                  disabled={!monthlyOk || !pkOk || testing !== null}
                  variant="outline"
                  className="border-blue-500/40 text-blue-200 hover:bg-blue-500/10 hover:text-blue-100 bg-inherit"
                >
                  {testing === 'monthly' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing monthly…
                    </>
                  ) : (
                    <>Test Monthly Checkout</>
                  )}
                </Button>
                <Button
                  onClick={() => runTestCheckout('yearly')}
                  disabled={!yearlyOk || !pkOk || testing !== null}
                  variant="outline"
                  className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10 hover:text-amber-100 bg-inherit"
                >
                  {testing === 'yearly' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing yearly…
                    </>
                  ) : (
                    <>Test Yearly Checkout</>
                  )}
                </Button>
              </div>

              {results.length === 0 ? (
                <p className="text-xs text-gray-500 italic">
                  No tests run yet. Click a button above to verify the integration.
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-auto">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 text-xs ${
                        r.status === 'success'
                          ? 'bg-green-500/5 border-green-500/30'
                          : r.status === 'error'
                          ? 'bg-red-500/5 border-red-500/30'
                          : 'bg-slate-800/50 border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {r.status === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                          ) : r.status === 'error' ? (
                            <XCircle className="w-4 h-4 text-red-400" />
                          ) : (
                            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                          )}
                          <span className="text-white font-semibold uppercase tracking-wide">
                            {r.plan}
                          </span>
                          <span className="text-gray-500">
                            {new Date(r.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        {r.status === 'success' && r.payload?.url && (
                          <a
                            href={r.payload.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-300 hover:text-amber-200 underline"
                          >
                            Open hosted checkout →
                          </a>
                        )}
                      </div>
                      <p
                        className={`mb-2 ${
                          r.status === 'success'
                            ? 'text-green-200'
                            : 'text-red-200'
                        }`}
                      >
                        {r.message}
                      </p>
                      {r.payload && (
                        <pre className="bg-slate-950/80 border border-slate-700 rounded p-2 text-[11px] text-gray-300 overflow-x-auto">
                          {JSON.stringify(r.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}


            </div>

            <p className="text-[11px] text-gray-500 italic">
              Tip: open the browser DevTools console for the full request/response logs.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StripeDebugPanel;
