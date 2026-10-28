import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Clock,
  ShieldAlert,
} from 'lucide-react';

interface WebhookEvent {
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

interface Totals {
  total: number;
  last24h: number;
  failed: number;
  signatureFailed: number;
  subscriptionEvents: number;
  invoicePaid: number;
}

interface ApiResponse {
  events: WebhookEvent[];
  totals: Totals;
  latestByType: Record<string, string>;
  generatedAt: string;
}

const KEY_EVENT_TYPES = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'checkout.session.completed',
];

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function statusBadge(ev: WebhookEvent) {
  if (!ev.signature_valid) {
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldAlert className="h-3 w-3" /> Signature failed
      </Badge>
    );
  }
  if (ev.status === 'processing_failed') {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  }
  if (ev.processed) {
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> Processed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" /> Received
    </Badge>
  );
}

function eventTypeColor(type: string): string {
  if (type.startsWith('customer.subscription'))
    return 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40';
  if (type.startsWith('invoice'))
    return 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40';
  if (type.startsWith('checkout'))
    return 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40';
  if (type.startsWith('payment_intent'))
    return 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40';
  return 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800';
}

export default function WebhookEventsViewer() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [includeTest, setIncludeTest] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: resp, error: fnError } = await supabase.functions.invoke(
        'get-webhook-events',
        { body: { limit: 20, includeTest } },
      );
      if (fnError) {
        // Try to read the underlying error body for non-2xx responses
        let detail = fnError.message || 'Failed to fetch webhook events';
        const ctx = (fnError as { context?: Response }).context;
        if (ctx && typeof ctx.text === 'function') {
          try {
            const body = await ctx.text();
            const parsed = JSON.parse(body);
            if (parsed?.error) detail = parsed.error;
          } catch {
            /* ignore */
          }
        }
        throw new Error(detail);
      }
      setData(resp as ApiResponse);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [includeTest]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Auto-refresh every 10s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => fetchEvents(), 10_000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchEvents]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyJson = (ev: WebhookEvent) => {
    navigator.clipboard.writeText(JSON.stringify(ev, null, 2));
  };

  const totals = data?.totals;
  const latestByType = data?.latestByType ?? {};

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-600" />
              Live Webhook Events
            </CardTitle>
            <CardDescription className="mt-1">
              Last 20 events received by the <code>stripe-webhook</code> edge function. Verify
              that <code>customer.subscription.created</code> and <code>invoice.paid</code> are
              flowing end-to-end.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <Switch
                checked={includeTest}
                onCheckedChange={setIncludeTest}
                aria-label="Include test events"
              />
              Include test events
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <Switch
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                aria-label="Auto refresh"
              />
              Auto-refresh (10s)
            </label>
            <Button onClick={fetchEvents} disabled={loading} variant="outline" size="sm">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Totals */}
        {totals && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <StatTile label="Total" value={totals.total} tone="default" />
            <StatTile label="Last 24h" value={totals.last24h} tone="default" />
            <StatTile label="Subscription" value={totals.subscriptionEvents} tone="indigo" />
            <StatTile label="invoice.paid" value={totals.invoicePaid} tone="emerald" />
            <StatTile
              label="Sig. failed"
              value={totals.signatureFailed}
              tone={totals.signatureFailed > 0 ? 'red' : 'default'}
            />
            <StatTile
              label="Processing failed"
              value={totals.failed}
              tone={totals.failed > 0 ? 'red' : 'default'}
            />
          </div>
        )}

        {/* Key event freshness indicators */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {KEY_EVENT_TYPES.map((type) => {
            const lastSeen = latestByType[type];
            const ok = !!lastSeen;
            return (
              <div
                key={type}
                className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border text-xs ${
                  ok
                    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30'
                    : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  )}
                  <code className="truncate">{type}</code>
                </div>
                <span
                  className={`shrink-0 ${
                    ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'
                  }`}
                >
                  {ok ? formatRelativeTime(lastSeen) : 'never'}
                </span>
              </div>
            );
          })}
        </div>

        {error && (
          <Alert className="border-red-300 bg-red-50 dark:bg-red-950/30">
            <XCircle className="h-4 w-4 text-red-600" />
            <AlertTitle>Could not load webhook events</AlertTitle>
            <AlertDescription className="text-xs break-words">{error}</AlertDescription>
          </Alert>
        )}

        {/* Empty state */}
        {!loading && !error && data && data.events.length === 0 && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle>No webhook events received yet</AlertTitle>
            <AlertDescription className="text-xs">
              Once Stripe delivers an event to your <code>stripe-webhook</code> endpoint it will
              appear here. To trigger one now, complete a test checkout from the Pricing page or
              use the Webhook Test Panel below to send a synthetic event.{' '}
              <a
                href="https://dashboard.stripe.com/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline inline-flex items-center gap-0.5"
              >
                Stripe Webhooks dashboard
                <ExternalLink className="h-3 w-3" />
              </a>
            </AlertDescription>
          </Alert>
        )}

        {/* Events list */}
        {data && data.events.length > 0 && (
          <div className="border rounded-lg divide-y overflow-hidden">
            {data.events.map((ev) => {
              const isOpen = expanded.has(ev.id);
              return (
                <div key={ev.id} className="bg-white dark:bg-slate-900/40">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(ev.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-left"
                  >
                    <div className="shrink-0">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code
                          className={`text-xs font-mono px-2 py-0.5 rounded ${eventTypeColor(
                            ev.event_type,
                          )}`}
                        >
                          {ev.event_type}
                        </code>
                        {statusBadge(ev)}
                        {ev.is_test && (
                          <Badge variant="outline" className="text-xs">
                            test
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                        <span>{formatRelativeTime(ev.received_at)}</span>
                        <span>•</span>
                        <span className="font-mono truncate">
                          {ev.stripe_event_id ?? '(no event id)'}
                        </span>
                      </div>
                      {ev.error_message && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 truncate">
                          {ev.error_message}
                        </p>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 pl-10 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <DetailField label="Stripe event ID" value={ev.stripe_event_id ?? '—'} mono />
                        <DetailField
                          label="Received at"
                          value={new Date(ev.received_at).toLocaleString()}
                        />
                        <DetailField
                          label="Processed at"
                          value={
                            ev.processed_at ? new Date(ev.processed_at).toLocaleString() : '—'
                          }
                        />
                        <DetailField
                          label="Signature valid"
                          value={ev.signature_valid ? 'yes' : 'NO'}
                          tone={ev.signature_valid ? 'ok' : 'bad'}
                        />
                        <DetailField label="Status" value={ev.status ?? '—'} mono />
                        <DetailField label="Test event" value={ev.is_test ? 'yes' : 'no'} />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Payload preview
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => copyJson(ev)}
                            className="h-7 px-2"
                          >
                            <Copy className="h-3 w-3 mr-1" /> Copy JSON
                          </Button>
                        </div>
                        <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto max-h-64">
                          {JSON.stringify(ev.payload_summary ?? {}, null, 2)}
                        </pre>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Only a summary is logged (livemode, api_version, object_id) —
                          card data and PII are never persisted.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {data && (
          <p className="text-[11px] text-slate-400 text-right">
            Last fetched {formatRelativeTime(data.generatedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'default' | 'indigo' | 'emerald' | 'red';
}) {
  const toneClass =
    tone === 'red'
      ? 'border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900'
      : tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900'
      : tone === 'indigo'
      ? 'border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-900'
      : 'border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-800';
  return (
    <div className={`rounded-lg border p-2.5 ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'ok' | 'bad';
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'bad'
      ? 'text-red-700 dark:text-red-400 font-semibold'
      : 'text-slate-700 dark:text-slate-300';
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`${mono ? 'font-mono' : ''} ${toneClass} break-all`}>{value}</p>
    </div>
  );
}
