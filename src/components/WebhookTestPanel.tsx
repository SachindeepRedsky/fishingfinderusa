import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Webhook,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  PlayCircle,
  ShieldCheck,
} from 'lucide-react';

interface RecentEvent {
  id: string;
  stripe_event_id: string | null;
  event_type: string;
  signature_valid: boolean;
  processed: boolean;
  is_test: boolean;
  status: string;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
}

interface SendResult {
  ok: boolean;
  webhookSecretConfigured?: boolean;
  summary?: string;
  error?: string;
  eventId?: string;
  eventType?: string;
  tests?: {
    validSignature: { expected: number; status: number | null; accepted: boolean; durationMs: number | null; error: string | null };
    tamperedSignature: { expected: number; status: number | null; rejected: boolean; durationMs: number | null; error: string | null };
    logging: { eventLogged: boolean };
  };
  recentEvents?: RecentEvent[];
}

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
}

function StatusBadge({ ev }: { ev: RecentEvent }) {
  if (!ev.signature_valid) return <Badge variant="destructive">Sig failed</Badge>;
  if (ev.status === 'processed') return <Badge className="bg-emerald-600 hover:bg-emerald-700">Processed</Badge>;
  if (ev.status === 'processing_failed') return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="secondary">Received</Badge>;
}

export default function WebhookTestPanel() {
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [secretConfigured, setSecretConfigured] = useState<boolean | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const loadList = async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-webhook-test', {
        body: { action: 'list' },
      });
      if (error) throw error;
      setSecretConfigured(!!data?.webhookSecretConfigured);
      setEvents((data?.events as RecentEvent[]) ?? []);
      if (data?.error) setListError(String(data.error));
    } catch (e) {
      setListError((e as Error).message);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  const runTest = async () => {
    setSending(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-webhook-test', {
        body: { action: 'send' },
      });
      if (error) throw error;
      setResult(data as SendResult);
      if ((data as SendResult)?.recentEvents) {
        setEvents((data as SendResult).recentEvents as RecentEvent[]);
      } else {
        loadList();
      }
      if (typeof (data as SendResult)?.webhookSecretConfigured === 'boolean') {
        setSecretConfigured(!!(data as SendResult).webhookSecretConfigured);
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-indigo-200 dark:border-indigo-900">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-indigo-600" /> Test webhook delivery
            </CardTitle>
            <CardDescription>
              Sends a synthetic, signed event to your <code>stripe-webhook</code> endpoint and verifies
              that valid signatures are accepted, forged signatures are rejected, and events are
              logged. No real Stripe data is touched.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadList} disabled={loadingList}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loadingList ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={runTest} disabled={sending}>
              <PlayCircle className={`h-4 w-4 mr-1.5 ${sending ? 'animate-pulse' : ''}`} />
              {sending ? 'Running…' : 'Send test event'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Secret status banner */}
        {secretConfigured === false && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle>STRIPE_WEBHOOK_SECRET is not set</AlertTitle>
            <AlertDescription className="text-sm">
              Add <code>STRIPE_WEBHOOK_SECRET</code> (format <code>whsec_…</code>) as an Edge Function
              secret. Get it from <a className="underline" target="_blank" rel="noopener noreferrer" href="https://dashboard.stripe.com/webhooks">Stripe Dashboard → Webhooks → your endpoint → Signing secret</a>.
            </AlertDescription>
          </Alert>
        )}
        {secretConfigured === true && !result && (
          <Alert className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <AlertTitle>STRIPE_WEBHOOK_SECRET is configured</AlertTitle>
            <AlertDescription className="text-sm">
              Click <strong>Send test event</strong> to verify the endpoint signs, validates, and
              processes events end-to-end.
            </AlertDescription>
          </Alert>
        )}

        {/* Result */}
        {result && (
          <Alert
            className={
              result.ok
                ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30'
                : 'border-red-300 bg-red-50 dark:bg-red-950/30'
            }
          >
            {result.ok ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
            <AlertTitle>
              {result.ok ? 'PASS — webhook is fully operational' : 'FAIL — webhook test did not pass'}
            </AlertTitle>
            <AlertDescription className="text-sm space-y-2">
              <p>{result.summary ?? result.error}</p>
              {result.tests && (
                <div className="grid sm:grid-cols-3 gap-2 mt-2">
                  <TestRow
                    label="Valid signature accepted"
                    pass={result.tests.validSignature.accepted}
                    detail={`HTTP ${result.tests.validSignature.status ?? '—'} (expected 200) · ${result.tests.validSignature.durationMs ?? '—'}ms`}
                  />
                  <TestRow
                    label="Forged signature rejected"
                    pass={result.tests.tamperedSignature.rejected}
                    detail={`HTTP ${result.tests.tamperedSignature.status ?? '—'} (expected 400) · ${result.tests.tamperedSignature.durationMs ?? '—'}ms`}
                  />
                  <TestRow
                    label="Event written to log"
                    pass={result.tests.logging.eventLogged}
                    detail={result.eventId ? `id: ${result.eventId.slice(0, 24)}…` : '—'}
                  />
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Recent events table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Last 10 received webhook events</h4>
            <span className="text-xs text-slate-500">
              {events.length} event{events.length === 1 ? '' : 's'}
            </span>
          </div>

          {listError && (
            <p className="text-xs text-red-600 mb-2">Could not load events: {listError}</p>
          )}

          {events.length === 0 && !loadingList && !listError && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
              No webhook events received yet. Click <strong>Send test event</strong> above to generate
              one, or trigger a real event from <a className="underline" target="_blank" rel="noopener noreferrer" href="https://dashboard.stripe.com/webhooks">Stripe Dashboard → Webhooks</a> ("Send test webhook").
            </div>
          )}

          {events.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Received</th>
                    <th className="px-3 py-2 font-medium">Processed</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} className="border-t">
                      <td className="px-3 py-2 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[180px]" title={ev.stripe_event_id ?? ''}>
                            {ev.stripe_event_id ?? '(no id)'}
                          </span>
                          {ev.is_test && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              test
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                        {ev.event_type}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge ev={ev} />
                        {ev.error_message && (
                          <p className="text-[10px] text-red-600 mt-0.5 max-w-[200px] truncate" title={ev.error_message}>
                            {ev.error_message}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {fmtTime(ev.received_at)}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {fmtTime(ev.processed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TestRow({ label, pass, detail }: { label: string; pass: boolean; detail: string }) {
  return (
    <div
      className={`rounded-md border p-2 ${
        pass
          ? 'border-emerald-200 bg-white dark:bg-slate-900/40'
          : 'border-red-200 bg-white dark:bg-slate-900/40'
      }`}
    >
      <div className="flex items-center gap-1.5 font-medium">
        {pass ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-600" />
        )}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{detail}</p>
    </div>
  );
}
