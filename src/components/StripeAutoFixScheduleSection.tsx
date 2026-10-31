import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Loader2,
  Clock,
  Mail,
  Webhook,
  Save,
  PlayCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Wrench,
  Sparkles,
} from 'lucide-react';
import {
  STRIPE_MODE,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
} from '@/lib/stripe';

const DEFAULT_WEBHOOK_URL =
  'https://xybqfeyhvifnstkhooba.supabase.co/functions/v1/stripe-webhook';
const DAY_MS = 24 * 60 * 60 * 1000;

interface ScheduleConfig {
  id: string;
  enabled: boolean;
  auto_fix: boolean;
  notification_email: string | null;
  webhook_url: string | null;
  scan_webhook_url: string | null;
  monthly_price_id: string | null;
  yearly_price_id: string | null;
  frontend_mode: string | null;
  updated_at: string;
}

interface AutoFixAttempt {
  issueId: string;
  issueTitle: string;
  fixAction: string;
  ok: boolean;
  message?: string;
  error?: string;
}

interface ScanLogRow {
  id: string;
  scanned_at: string;
  trigger: string;
  error_count: number;
  warning_count: number;
  issues: Array<{
    id: string;
    severity: 'error' | 'warning' | 'info';
    title: string;
    description: string;
  }>;
  backend_mode: string | null;
  notified: boolean;
  notification_channel: string | null;
  notification_error: string | null;
  scan_error: string | null;
  auto_fix_attempted: boolean | null;
  auto_fix_results: AutoFixAttempt[] | null;
  post_fix_error_count: number | null;
  post_fix_warning_count: number | null;
  post_fix_issues:
    | Array<{
        id: string;
        severity: 'error' | 'warning' | 'info';
        title: string;
        description: string;
      }>
    | null;
}

export default function StripeAutoFixScheduleSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [config, setConfig] = useState<ScheduleConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [autoFix, setAutoFix] = useState(false);
  const [email, setEmail] = useState('');
  const [scanWebhook, setScanWebhook] = useState('');
  const [lastScan, setLastScan] = useState<ScanLogRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: cfg, error: cfgErr }, { data: logs, error: logErr }] = await Promise.all([
        supabase
          .from('stripe_autofix_schedule')
          .select('*')
          .eq('id', 'singleton')
          .maybeSingle(),
        supabase
          .from('stripe_autofix_scan_log')
          .select('*')
          .order('scanned_at', { ascending: false })
          .limit(1),
      ]);
      if (cfgErr) throw cfgErr;
      if (logErr) throw logErr;
      const c = cfg as ScheduleConfig | null;
      setConfig(c);
      setEnabled(c?.enabled ?? false);
      setAutoFix(c?.auto_fix ?? false);
      setEmail(c?.notification_email ?? '');
      setScanWebhook(c?.scan_webhook_url ?? '');
      setLastScan((Array.isArray(logs) && logs[0]) ? (logs[0] as ScanLogRow) : null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaveOk(false);
    try {
      const payload = {
        id: 'singleton',
        enabled,
        auto_fix: autoFix,
        notification_email: email.trim() || null,
        scan_webhook_url: scanWebhook.trim() || null,
        webhook_url: DEFAULT_WEBHOOK_URL,
        monthly_price_id: STRIPE_PRICE_MONTHLY || null,
        yearly_price_id: STRIPE_PRICE_YEARLY || null,
        frontend_mode: STRIPE_MODE || 'test',
        updated_at: new Date().toISOString(),
      };
      const { error: upErr } = await supabase
        .from('stripe_autofix_schedule')
        .upsert(payload, { onConflict: 'id' });
      if (upErr) throw upErr;
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setError(null);
    try {
      // Make sure latest config is persisted before running
      await save();
      const { data, error: invokeErr } = await supabase.functions.invoke(
        'stripe-autofix-scheduled',
        { body: { trigger: 'manual' } },
      );
      if (invokeErr) throw invokeErr;
      if (data?.ok === false) throw new Error(data.error || 'Scheduled scan failed');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  // Auto-trigger fallback scheduler: if enabled and last scan is older than 24h
  // (or never), run a scheduled scan now. This guarantees daily coverage even
  // without pg_cron, as long as the page is visited at least once per day.
  useEffect(() => {
    if (loading || !config || !enabled) return;
    const lastTime = lastScan ? new Date(lastScan.scanned_at).getTime() : 0;
    const stale = !lastTime || Date.now() - lastTime > DAY_MS;
    if (stale && !running) {
      void (async () => {
        setRunning(true);
        try {
          await supabase.functions.invoke('stripe-autofix-scheduled', {
            body: { trigger: 'auto-stale' },
          });
          await loadAll();
        } catch {
          // ignore — user can manually retry
        } finally {
          setRunning(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, config?.enabled]);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 p-4 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading schedule…
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-purple-200 dark:border-purple-900 bg-gradient-to-br from-purple-50/60 to-pink-50/30 dark:from-purple-950/20 dark:to-pink-950/10 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          <div className="h-8 w-8 rounded-lg bg-purple-600 flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              Daily scheduled scan
              <Badge variant={enabled ? 'default' : 'outline'} className={enabled ? 'bg-purple-600' : ''}>
                {enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Automatically runs the auto-fix <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">detect</code> action
              every 24 hours and notifies you if any errors or warnings are found.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            id="autofix-schedule-enabled"
          />
          <Label htmlFor="autofix-schedule-enabled" className="text-xs cursor-pointer">
            Enable schedule
          </Label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="autofix-email" className="text-xs font-semibold flex items-center gap-1">
            <Mail className="h-3 w-3" />
            Notification email
          </Label>
          <Input
            id="autofix-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            className="mt-1.5 text-xs"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Sent via the GATEWAY_API_KEY when issues are detected.
          </p>
        </div>
        <div>
          <Label htmlFor="autofix-scan-webhook" className="text-xs font-semibold flex items-center gap-1">
            <Webhook className="h-3 w-3" />
            Notification webhook URL (optional)
          </Label>
          <Input
            id="autofix-scan-webhook"
            value={scanWebhook}
            onChange={(e) => setScanWebhook(e.target.value)}
            placeholder="https://hooks.slack.com/... or your own endpoint"
            className="mt-1.5 text-xs font-mono"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            POSTed JSON: {`{ source, trigger, errorCount, warningCount, issues }`}
          </p>
        </div>
      </div>

      {/* Auto-fix toggle */}
      <div
        className={`rounded-lg border-2 p-3 transition-colors ${
          autoFix
            ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/20'
            : 'border-dashed border-slate-300 dark:border-slate-700 bg-white/40 dark:bg-slate-900/20'
        }`}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            <div
              className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                autoFix ? 'bg-emerald-600' : 'bg-slate-400'
              }`}
            >
              <Wrench className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <Label
                htmlFor="autofix-auto-fix"
                className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="h-3 w-3 text-emerald-600" />
                Auto-fix detected issues automatically
              </Label>
              <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5 max-w-md">
                When the scheduled scan finds fixable problems, immediately invoke the
                matching fix (<code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">fix-webhook</code>,{' '}
                <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">sync-prices</code>,{' '}
                <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">create-recurring-prices</code>),
                then re-run detect to confirm. Fix outcomes are included in the email / webhook notification.
              </p>
            </div>
          </div>
          <Switch
            checked={autoFix}
            onCheckedChange={setAutoFix}
            id="autofix-auto-fix"
          />
        </div>
      </div>


      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…
            </>
          ) : saveOk ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Saved
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Save schedule
            </>
          )}
        </Button>
        <Button onClick={runNow} disabled={running} variant="outline" size="sm">
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Running…
            </>
          ) : (
            <>
              <PlayCircle className="h-3.5 w-3.5 mr-1.5" /> Run scheduled scan now
            </>
          )}
        </Button>
        <Button onClick={loadAll} variant="ghost" size="sm">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {error && (
        <Alert className="border-red-300 bg-red-50 dark:bg-red-950/30">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="text-xs font-mono break-words">{error}</AlertDescription>
        </Alert>
      )}

      {/* Last scan result */}
      <div className="rounded border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h4 className="font-semibold text-xs flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Last scheduled scan
          </h4>
          {lastScan && (
            <span className="text-[10px] text-slate-500">
              {new Date(lastScan.scanned_at).toLocaleString()} · trigger:{' '}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{lastScan.trigger}</code>
            </span>
          )}
        </div>

        {!lastScan ? (
          <p className="text-xs text-slate-500 italic">
            No scheduled scans have run yet. Click "Run scheduled scan now" to test.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {lastScan.scan_error ? (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" /> Scan failed
                </Badge>
              ) : lastScan.error_count === 0 && lastScan.warning_count === 0 ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> All clear
                </Badge>
              ) : (
                <>
                  {lastScan.error_count > 0 && (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" /> {lastScan.error_count} error
                      {lastScan.error_count === 1 ? '' : 's'}
                    </Badge>
                  )}
                  {lastScan.warning_count > 0 && (
                    <Badge className="bg-amber-500 hover:bg-amber-500">
                      <AlertTriangle className="h-3 w-3 mr-1" /> {lastScan.warning_count} warning
                      {lastScan.warning_count === 1 ? '' : 's'}
                    </Badge>
                  )}
                </>
              )}
              {lastScan.notified && (
                <Badge variant="outline" className="border-emerald-400 text-emerald-700 dark:text-emerald-400">
                  Notified via {lastScan.notification_channel}
                </Badge>
              )}
              {lastScan.notification_error && (
                <Badge variant="outline" className="border-red-400 text-red-700 dark:text-red-400">
                  Notify failed
                </Badge>
              )}
              {lastScan.backend_mode && (
                <Badge variant="outline">mode: {lastScan.backend_mode}</Badge>
              )}
              {lastScan.auto_fix_attempted && Array.isArray(lastScan.auto_fix_results) && (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">
                  <Wrench className="h-3 w-3 mr-1" />
                  Auto-fix ran ({lastScan.auto_fix_results.length})
                </Badge>
              )}
              {lastScan.auto_fix_attempted &&
                lastScan.post_fix_error_count !== null &&
                lastScan.post_fix_warning_count !== null &&
                (lastScan.post_fix_error_count === 0 && lastScan.post_fix_warning_count === 0 ? (
                  <Badge variant="outline" className="border-emerald-400 text-emerald-700 dark:text-emerald-400">
                    <Sparkles className="h-3 w-3 mr-1" /> Post-fix: all clear
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">
                    Post-fix: {lastScan.post_fix_error_count}E / {lastScan.post_fix_warning_count}W remaining
                  </Badge>
                ))}
            </div>



            {lastScan.scan_error && (
              <div className="text-[11px] font-mono text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 p-2 rounded break-words">
                {lastScan.scan_error}
              </div>
            )}

            {lastScan.notification_error && (
              <div className="text-[11px] font-mono text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 p-2 rounded break-words">
                Notification error: {lastScan.notification_error}
              </div>
            )}

            {lastScan.auto_fix_attempted &&
              Array.isArray(lastScan.auto_fix_results) &&
              lastScan.auto_fix_results.length > 0 && (
                <div className="rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                    <Wrench className="h-3 w-3" />
                    Automatic fixes applied
                  </div>
                  <ul className="space-y-1">
                    {lastScan.auto_fix_results.map((a, idx) => (
                      <li
                        key={`${a.issueId}-${idx}`}
                        className="text-[11px] flex items-start gap-1.5 p-1.5 rounded bg-white/70 dark:bg-slate-900/40"
                      >
                        {a.ok ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-600 mt-0.5 shrink-0" />
                        )}
                        <span className="min-w-0 break-words">
                          <strong>{a.issueTitle}</strong>{' '}
                          <Badge variant="outline" className="text-[9px] py-0 h-4 ml-1">
                            {a.fixAction}
                          </Badge>
                          <span className="block text-slate-600 dark:text-slate-400 mt-0.5">
                            {a.ok ? a.message || 'Applied' : `Failed: ${a.error || 'unknown error'}`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {lastScan.post_fix_error_count !== null &&
                    lastScan.post_fix_warning_count !== null && (
                      <div className="text-[11px] pt-1 border-t border-emerald-200 dark:border-emerald-900">
                        {lastScan.post_fix_error_count === 0 &&
                        lastScan.post_fix_warning_count === 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                            <CheckCircle2 className="h-3 w-3 inline mr-1" />
                            Post-fix re-scan confirmed: all issues resolved.
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400">
                            Post-fix re-scan: {lastScan.post_fix_error_count} error(s) and{' '}
                            {lastScan.post_fix_warning_count} warning(s) remaining (manual action required).
                          </span>
                        )}
                      </div>
                    )}
                </div>
              )}


            {Array.isArray(lastScan.issues) && lastScan.issues.length > 0 && (
              <ul className="space-y-1">
                {lastScan.issues.slice(0, 8).map((i) => (
                  <li
                    key={i.id}
                    className="text-[11px] flex items-start gap-1.5 p-1.5 rounded bg-slate-50 dark:bg-slate-800/40"
                  >
                    {i.severity === 'error' ? (
                      <XCircle className="h-3 w-3 text-red-600 mt-0.5 shrink-0" />
                    ) : i.severity === 'warning' ? (
                      <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-blue-600 mt-0.5 shrink-0" />
                    )}
                    <span>
                      <strong>{i.title}</strong>{' '}
                      <span className="text-slate-600 dark:text-slate-400">— {i.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-500">
        The schedule runs daily at 09:00 UTC via a database-scheduled trigger. As a fallback, the
        scan also auto-runs whenever this page is opened and the last scan is more than 24 hours
        old, so daily coverage is guaranteed even if the cron worker is paused.
      </p>
    </div>
  );
}
