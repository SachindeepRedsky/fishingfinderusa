import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  ExternalLink,
  KeyRound,
  Webhook,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import {
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  STRIPE_MODE,
  STRIPE_CONFIG_VALID,
  STRIPE_CONFIG_ERROR,
} from '@/lib/stripe';
import E2ECheckoutTest from '@/components/E2ECheckoutTest';
import WebhookTestPanel from '@/components/WebhookTestPanel';
import StripeAutoFixPanel from '@/components/StripeAutoFixPanel';
import WebhookEventsViewer from '@/components/WebhookEventsViewer';



interface SecretCheck {
  name: string;
  required: boolean;
  configured: boolean;
  preview: string | null;
  format: 'valid' | 'invalid' | 'missing' | 'unknown';
  formatMessage: string;
  description: string;
  scope: 'edge-function' | 'frontend';
}

interface DetectedIssue {
  id: string;
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
  fix: string;
  docsUrl?: string;
}

interface PriceValidation {
  envVar: string;
  priceId: string | null;
  expectedInterval: 'month' | 'year';
  ok: boolean;
  exists: boolean;
  active: boolean | null;
  recurring: boolean | null;
  interval: string | null;
  mode: 'test' | 'live' | 'unknown' | null;
  amount: number | null;
  currency: string | null;
  productName: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  errorType: string | null;
  errorMessage: string | null;
}

interface DiagnosticResult {
  timestamp: string;
  allRequiredConfigured: boolean;
  readyForPayments: boolean;
  checks: SecretCheck[];
  liveApiTest: {
    ok: boolean;
    message: string;
    mode: string | null;
    endpoint?: string;
    httpStatus?: number | null;
    errorCode?: string | null;
    errorType?: string | null;
    errorMessage?: string | null;
  };
  priceValidations?: PriceValidation[];
  issues?: DetectedIssue[];
  missingRequired: string[];
}



const SECRET_DOCS: Record<string, { whereToGet: string; dashboardUrl: string; example: string }> = {
  STRIPE_SECRET_KEY: {
    whereToGet: 'Stripe Dashboard → Developers → API keys → Secret key',
    dashboardUrl: 'https://dashboard.stripe.com/apikeys',
    example: 'sk_test_51ABC...xyz  (or sk_live_... for production)',
  },
  STRIPE_WEBHOOK_SECRET: {
    whereToGet: 'Stripe Dashboard → Developers → Webhooks → [Your endpoint] → Signing secret',
    dashboardUrl: 'https://dashboard.stripe.com/webhooks',
    example: 'whsec_1ABC...xyz',
  },
};

function StatusIcon({ status }: { status: SecretCheck['format'] }) {
  if (status === 'valid') return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (status === 'invalid') return <AlertTriangle className="h-5 w-5 text-amber-600" />;
  return <XCircle className="h-5 w-5 text-red-600" />;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <Copy className="h-3.5 w-3.5 mr-1.5" />
      {copied ? 'Copied!' : label}
    </Button>
  );
}

export default function StripeSetup() {
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostic = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('stripe-config-diagnostic', {
        body: {
          publishableMode: STRIPE_MODE,
          priceMonthly: STRIPE_PRICE_MONTHLY,
          priceYearly: STRIPE_PRICE_YEARLY,
        },
      });

      if (fnError) throw fnError;
      setResult(data as DiagnosticResult);
    } catch (err) {
      setError((err as Error).message || 'Failed to run diagnostic');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    runDiagnostic();
  }, []);

  // Frontend env var checks
  const frontendChecks: SecretCheck[] = [
    {
      name: 'VITE_STRIPE_PUBLISHABLE_KEY',
      required: true,
      configured: !!STRIPE_PUBLISHABLE_KEY,
      preview: STRIPE_PUBLISHABLE_KEY
        ? STRIPE_PUBLISHABLE_KEY.slice(0, 12) + '...' + STRIPE_PUBLISHABLE_KEY.slice(-4)
        : null,
      format: STRIPE_PUBLISHABLE_KEY
        ? STRIPE_MODE !== 'unknown' && STRIPE_PUBLISHABLE_KEY.length >= 50
          ? 'valid'
          : 'invalid'
        : 'missing',
      formatMessage: STRIPE_PUBLISHABLE_KEY
        ? STRIPE_MODE === 'unknown'
          ? 'Must start with pk_test_ or pk_live_'
          : `Valid ${STRIPE_MODE.toUpperCase()} mode key`
        : 'Not configured',
      description:
        'Public Stripe key safe to expose in the frontend bundle. Used by Stripe.js to render Elements and tokenize cards.',
      scope: 'frontend',
    },
    {
      name: 'VITE_STRIPE_PRICE_MONTHLY',
      required: true,
      configured: !!STRIPE_PRICE_MONTHLY,
      preview: STRIPE_PRICE_MONTHLY || null,
      format: STRIPE_PRICE_MONTHLY?.startsWith('price_') ? 'valid' : STRIPE_PRICE_MONTHLY ? 'invalid' : 'missing',
      formatMessage: STRIPE_PRICE_MONTHLY
        ? STRIPE_PRICE_MONTHLY.startsWith('price_')
          ? 'Valid price ID'
          : 'Must start with price_'
        : 'Not configured',
      description: 'Stripe Price ID for the monthly subscription plan ($9.99/month).',
      scope: 'frontend',
    },
    {
      name: 'VITE_STRIPE_PRICE_YEARLY',
      required: true,
      configured: !!STRIPE_PRICE_YEARLY,
      preview: STRIPE_PRICE_YEARLY || null,
      format: STRIPE_PRICE_YEARLY?.startsWith('price_') ? 'valid' : STRIPE_PRICE_YEARLY ? 'invalid' : 'missing',
      formatMessage: STRIPE_PRICE_YEARLY
        ? STRIPE_PRICE_YEARLY.startsWith('price_')
          ? 'Valid price ID'
          : 'Must start with price_'
        : 'Not configured',
      description: 'Stripe Price ID for the yearly subscription plan ($79.99/year).',
      scope: 'frontend',
    },
  ];

  const allChecks = [...(result?.checks ?? []), ...frontendChecks];
  const requiredMissing = allChecks.filter((c) => c.required && (c.format !== 'valid'));
  const allReady = result?.readyForPayments && requiredMissing.filter((c) => c.scope === 'frontend').length === 0;

  // Detect mode mismatch (frontend pk_live with backend sk_test or vice versa)
  const backendMode = result?.liveApiTest?.mode;
  const frontendMode = STRIPE_MODE;
  const modeMismatch =
    backendMode && frontendMode !== 'unknown' && backendMode !== frontendMode;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 mb-4">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to app
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Stripe Setup Wizard</h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 max-w-2xl">
                Diagnose and configure your Stripe integration. This wizard checks every required key and
                gives you copy-paste instructions for any that are missing.
              </p>
            </div>
            <Button onClick={runDiagnostic} disabled={loading} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Re-run diagnostic
            </Button>
          </div>
        </div>

        {/* Setup Status Summary Card — quick green/red glance */}
        <SetupStatusCard
          loading={loading}
          edgeFnReachable={!error && result !== null}
          edgeFnError={error}
          publishableKeyOk={
            !!STRIPE_PUBLISHABLE_KEY &&
            STRIPE_MODE !== 'unknown' &&
            STRIPE_PUBLISHABLE_KEY.length >= 50
          }
          priceIdsOk={
            !!STRIPE_PRICE_MONTHLY &&
            !!STRIPE_PRICE_YEARLY &&
            STRIPE_PRICE_MONTHLY.startsWith('price_') &&
            STRIPE_PRICE_YEARLY.startsWith('price_')
          }
          webhookOk={
            !!result?.checks.find(
              (c) => c.name === 'STRIPE_WEBHOOK_SECRET' && c.format === 'valid'
            )
          }
          publishableKeyDetail={
            !STRIPE_PUBLISHABLE_KEY
              ? 'VITE_STRIPE_PUBLISHABLE_KEY is not set in .env'
              : STRIPE_MODE === 'unknown'
              ? 'Key must start with pk_test_ or pk_live_'
              : `${STRIPE_MODE.toUpperCase()} mode key loaded`
          }
          priceIdsDetail={
            !STRIPE_PRICE_MONTHLY && !STRIPE_PRICE_YEARLY
              ? 'Both monthly & yearly price IDs are missing'
              : !STRIPE_PRICE_MONTHLY
              ? 'VITE_STRIPE_PRICE_MONTHLY is missing'
              : !STRIPE_PRICE_YEARLY
              ? 'VITE_STRIPE_PRICE_YEARLY is missing'
              : !STRIPE_PRICE_MONTHLY.startsWith('price_') ||
                !STRIPE_PRICE_YEARLY.startsWith('price_')
              ? 'Price IDs must start with price_'
              : 'Both monthly & yearly price IDs loaded'
          }
          webhookDetail={
            !result
              ? 'Waiting for diagnostic…'
              : result.checks.find((c) => c.name === 'STRIPE_WEBHOOK_SECRET')?.format === 'valid'
              ? 'Webhook signing secret configured'
              : 'STRIPE_WEBHOOK_SECRET not set in Edge Function Secrets'
          }
        />

        {/* Detected Issues — dedicated red cards with one-line fixes */}
        {result?.issues && result.issues.length > 0 && (
          <DetectedIssuesPanel issues={result.issues} />
        )}

        {/* Auto-fix panel — detects + one-click fixes for common misconfigs */}
        <StripeAutoFixPanel />



        {/* Overall status banner */}
        {!loading && result && (
          <Alert
            className={`mb-6 ${
              allReady
                ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30'
                : 'border-amber-300 bg-amber-50 dark:bg-amber-950/30'
            }`}
          >
            {allReady ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            <AlertTitle className="text-base">
              {allReady ? 'Stripe is fully configured and ready for payments' : 'Configuration incomplete'}
            </AlertTitle>
            <AlertDescription>
              {allReady
                ? `Live API test passed (${result.liveApiTest.mode} mode). Customers can now successfully complete checkout.`
                : `${requiredMissing.length} required ${requiredMissing.length === 1 ? 'key is' : 'keys are'} missing or invalid. Follow the steps below to fix.`}
            </AlertDescription>
          </Alert>
        )}

        {modeMismatch && (
          <Alert className="mb-6 border-red-300 bg-red-50 dark:bg-red-950/30">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <AlertTitle>Mode mismatch detected</AlertTitle>
            <AlertDescription>
              Your frontend publishable key is in <strong>{frontendMode}</strong> mode, but your backend
              secret key is in <strong>{backendMode}</strong> mode. Stripe will reject all transactions
              until both are in the same mode (test OR live, not mixed).
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="mb-6 border-red-300 bg-red-50 dark:bg-red-950/30">
            <XCircle className="h-5 w-5 text-red-600" />
            <AlertTitle>Diagnostic failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!STRIPE_CONFIG_VALID && STRIPE_CONFIG_ERROR && (
          <Alert className="mb-6 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <AlertTitle>Frontend config issue</AlertTitle>
            <AlertDescription className="text-sm">{STRIPE_CONFIG_ERROR}</AlertDescription>
          </Alert>
        )}

        {/* Steps */}
        <Tabs defaultValue="step1" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="step1">1. Diagnostic</TabsTrigger>
            <TabsTrigger value="step2">
              2. Missing Keys{' '}
              {requiredMissing.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {requiredMissing.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="step3">3. Instructions</TabsTrigger>
          </TabsList>

          {/* STEP 1: Diagnostic results */}
          <TabsContent value="step1" className="space-y-4">
            {/* End-to-end test — proves the full flow works without a real card */}
            <E2ECheckoutTest />

            {/* Live webhook events viewer — verifies subscription/invoice events are flowing */}
            <WebhookEventsViewer />

            {/* Webhook delivery test — verifies signature validation + event logging */}
            <WebhookTestPanel />


            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5" /> Backend Secrets (Edge Functions)
                </CardTitle>
                <CardDescription>
                  These run on the server. They never reach the browser. Configured via Famous dashboard
                  → Edge Function Secrets.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading && <p className="text-sm text-slate-500">Running diagnostic…</p>}
                {result?.checks.map((check) => (
                  <SecretRow key={check.name} check={check} />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Webhook className="h-5 w-5" /> Frontend Environment Variables
                </CardTitle>
                <CardDescription>
                  These are bundled into the browser. Set them in the project's <code>.env</code> file.
                  Only use values that are safe to expose publicly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {frontendChecks.map((check) => (
                  <SecretRow key={check.name} check={check} />
                ))}
              </CardContent>
            </Card>

            {result?.liveApiTest && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {result.liveApiTest.ok ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    Live Stripe API Test
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{result.liveApiTest.message}</p>
                  {result.liveApiTest.mode && (
                    <Badge variant="outline" className="mt-2">
                      Backend mode: {result.liveApiTest.mode.toUpperCase()}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            )}

            {result?.priceValidations && result.priceValidations.length > 0 && (
              <PriceValidationCard validations={result.priceValidations} />
            )}
          </TabsContent>


          {/* STEP 2: Missing keys list */}
          <TabsContent value="step2" className="space-y-4">
            {requiredMissing.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold mb-1">All required keys are configured!</h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    No further action needed. You can proceed to test a checkout flow.
                  </p>
                  <Link to="/pricing">
                    <Button className="mt-4">Test checkout flow</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <>
                <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <AlertTitle>{requiredMissing.length} key(s) need attention</AlertTitle>
                  <AlertDescription>
                    Each key below has step-by-step instructions in the next tab.
                  </AlertDescription>
                </Alert>
                {requiredMissing.map((check) => (
                  <Card key={check.name} className="border-amber-200">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <CardTitle className="font-mono text-base">{check.name}</CardTitle>
                          <CardDescription className="mt-1">{check.description}</CardDescription>
                        </div>
                        <Badge variant={check.scope === 'edge-function' ? 'default' : 'secondary'}>
                          {check.scope === 'edge-function' ? 'Backend' : 'Frontend'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                        {check.formatMessage}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>

          {/* STEP 3: Instructions */}
          <TabsContent value="step3" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Backend Secrets (Edge Functions)</CardTitle>
                <CardDescription>
                  These secrets are added through the Famous platform dashboard. They are encrypted and
                  only accessible to your edge functions at runtime.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {result?.checks.map((check) => {
                  const docs = SECRET_DOCS[check.name];
                  if (!docs) return null;
                  const isMissing = check.format !== 'valid';
                  return (
                    <div
                      key={check.name}
                      className={`rounded-lg border p-4 ${
                        isMissing ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' : 'border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <StatusIcon status={check.format} />
                        <h3 className="font-mono font-semibold">{check.name}</h3>
                        {!check.required && <Badge variant="secondary">Optional</Badge>}
                      </div>
                      <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700 dark:text-slate-300 ml-1">
                        <li>
                          Go to{' '}
                          <a
                            href={docs.dashboardUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                          >
                            {docs.whereToGet}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </li>
                        <li>
                          Copy the secret value (format: <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{docs.example}</code>)
                        </li>
                        <li>
                          Open your Famous project dashboard → <strong>Backend</strong> →{' '}
                          <strong>Edge Function Secrets</strong>
                        </li>
                        <li>
                          Click <strong>Add Secret</strong> and enter:
                          <div className="mt-2 ml-4 space-y-2">
                            <div className="flex items-center gap-2 bg-slate-900 text-slate-100 p-2 rounded font-mono text-xs">
                              <span className="text-slate-400">Name:</span>
                              <span className="flex-1">{check.name}</span>
                              <CopyButton text={check.name} />
                            </div>
                            <div className="flex items-center gap-2 bg-slate-900 text-slate-100 p-2 rounded font-mono text-xs">
                              <span className="text-slate-400">Value:</span>
                              <span className="flex-1 italic text-slate-400">[paste from step 2]</span>
                            </div>
                          </div>
                        </li>
                        <li>
                          Save. The change is live immediately — no redeploy needed. Click{' '}
                          <strong>Re-run diagnostic</strong> at the top of this page to confirm.
                        </li>
                      </ol>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Frontend Environment Variables</CardTitle>
                <CardDescription>
                  These go in your project's <code>.env</code> file. They are public — only use values
                  that are safe to expose in browser JavaScript.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Add these lines to <code>.env</code> in your project root:
                </p>
                <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                  <pre>{`VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51ABC...
VITE_STRIPE_PRICE_MONTHLY=price_1ABC...
VITE_STRIPE_PRICE_YEARLY=price_1XYZ...`}</pre>
                </div>
                <div className="mt-3 flex gap-2">
                  <CopyButton
                    text="VITE_STRIPE_PUBLISHABLE_KEY=\nVITE_STRIPE_PRICE_MONTHLY=\nVITE_STRIPE_PRICE_YEARLY="
                    label="Copy template"
                  />
                  <a
                    href="https://dashboard.stripe.com/apikeys"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open Stripe API Keys
                    </Button>
                  </a>
                  <a
                    href="https://dashboard.stripe.com/products"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open Stripe Products
                    </Button>
                  </a>
                </div>
                <Alert className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-sm">Restart required</AlertTitle>
                  <AlertDescription className="text-xs">
                    After editing <code>.env</code>, restart your dev server (or redeploy) for changes
                    to take effect.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security checklist</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>NEVER paste a <code>sk_*</code> key into a <code>VITE_*</code> variable — it will leak in your bundle.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>NEVER paste secret keys into chat, git commits, or screenshots. Rotate any leaked key at <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">dashboard.stripe.com/apikeys</a> immediately.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>Use <code>sk_test_</code> + <code>pk_test_</code> together while developing; switch BOTH to <code>_live_</code> when ready for production.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>This wizard only ever shows the first/last 4 characters of any configured secret. Full values stay encrypted on the server.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SecretRow({ check }: { check: SecretCheck }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-white dark:bg-slate-900/50">
      <StatusIcon status={check.format} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold">{check.name}</span>
          {check.required ? (
            <Badge variant="outline" className="text-xs">Required</Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">Optional</Badge>
          )}
          {check.preview && (
            <code className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
              {check.preview}
            </code>
          )}
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{check.formatMessage}</p>
      </div>
    </div>
  );
}


interface SetupStatusCardProps {
  loading: boolean;
  edgeFnReachable: boolean;
  edgeFnError: string | null;
  publishableKeyOk: boolean;
  priceIdsOk: boolean;
  webhookOk: boolean;
  publishableKeyDetail: string;
  priceIdsDetail: string;
  webhookDetail: string;
}

function SetupStatusCard({
  loading,
  edgeFnReachable,
  edgeFnError,
  publishableKeyOk,
  priceIdsOk,
  webhookOk,
  publishableKeyDetail,
  priceIdsDetail,
  webhookDetail,
}: SetupStatusCardProps) {
  const items = [
    {
      label: 'Publishable Key loaded',
      ok: publishableKeyOk,
      detail: publishableKeyDetail,
      pending: false,
    },
    {
      label: 'Price IDs loaded',
      ok: priceIdsOk,
      detail: priceIdsDetail,
      pending: false,
    },
    {
      label: 'Edge Function reachable',
      ok: edgeFnReachable,
      detail: loading
        ? 'Checking…'
        : edgeFnReachable
        ? 'stripe-config-diagnostic responded successfully'
        : edgeFnError || 'Edge function did not respond',
      pending: loading,
    },
    {
      label: 'Webhook configured',
      ok: webhookOk,
      detail: loading ? 'Checking…' : webhookDetail,
      pending: loading && !webhookOk,
    },
  ];

  const okCount = items.filter((i) => i.ok).length;
  const allOk = okCount === items.length;

  return (
    <Card
      className={`mb-6 border-2 ${
        allOk
          ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            Setup Status
          </CardTitle>
          <Badge
            variant={allOk ? 'default' : 'secondary'}
            className={allOk ? 'bg-emerald-600 hover:bg-emerald-600' : ''}
          >
            {okCount} / {items.length} ready
          </Badge>
        </div>
        <CardDescription>
          At-a-glance health check of your Stripe integration. Each indicator must be green
          before live payments can succeed.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              item.ok
                ? 'border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900'
                : 'border-red-200 bg-red-50/60 dark:bg-red-950/20 dark:border-red-900'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {item.pending ? (
                <RefreshCw className="h-5 w-5 text-slate-400 animate-spin" />
              ) : item.ok ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{item.label}</span>
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    item.ok
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  }`}
                >
                  {item.ok ? 'OK' : 'Not ready'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 break-words">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Detected Issues panel — renders one dedicated red card per misconfiguration
// detected by the edge function (pk_* in secret slot, rk_* restricted key,
// test/live mode mismatch, real Stripe API error code/type/message, etc.)
// Each card has a one-line fix instruction the user can act on immediately.
// ----------------------------------------------------------------------------
function DetectedIssuesPanel({ issues }: { issues: DetectedIssue[] }) {
  return (
    <Card className="mb-6 border-2 border-red-300 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-lg text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
            {issues.length} Stripe configuration {issues.length === 1 ? 'issue' : 'issues'} detected
          </CardTitle>
          <Badge variant="destructive">Action required</Badge>
        </div>
        <CardDescription className="text-red-700/80 dark:text-red-300/80">
          Each issue below is a specific reason the <code>create-checkout-session</code> edge function
          is returning a non-2xx status (bad secret key, missing/wrong-mode price ID, etc.). Apply the
          one-line fix and re-run the diagnostic.
        </CardDescription>

      </CardHeader>
      <CardContent className="space-y-3">
        {issues.map((issue) => (
          <div
            key={issue.id}
            className="rounded-lg border-2 border-red-300 bg-white dark:bg-slate-900/60 dark:border-red-900 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h4 className="font-semibold text-sm text-red-900 dark:text-red-200">
                    {issue.title}
                  </h4>
                  <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
                    {issue.severity}
                  </Badge>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 mb-2 break-words">
                  {issue.detail}
                </p>
                <div className="rounded-md bg-red-100/70 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300 mt-0.5 shrink-0">
                      Fix
                    </span>
                    <p className="text-xs text-red-900 dark:text-red-100 break-words">
                      {issue.fix}
                    </p>
                  </div>
                </div>
                {issue.docsUrl && (
                  <div className="mt-2">
                    <a
                      href={issue.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
                    >
                      Open Stripe Dashboard
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}


// ----------------------------------------------------------------------------
// PriceValidationCard — shows live results of validating each Stripe Price ID
// (exists / active / recurring / interval / mode) by hitting /v1/prices/{id}.
// ----------------------------------------------------------------------------
function PriceValidationCard({ validations }: { validations: PriceValidation[] }) {
  const allOk = validations.every((v) => v.ok);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {allOk ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600" />
          )}
          Price ID Validation
        </CardTitle>
        <CardDescription>
          Each price ID is fetched live from Stripe (<code>GET /v1/prices/{'{id}'}</code>) to
          verify it exists, is active, is recurring, has the expected interval, and is in the
          same test/live mode as STRIPE_SECRET_KEY.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {validations.map((v) => (
          <div
            key={v.envVar}
            className={`rounded-lg border p-3 ${
              v.ok
                ? 'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900'
                : 'border-red-200 bg-red-50/40 dark:bg-red-950/20 dark:border-red-900'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                {v.ok ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold">{v.envVar}</span>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    expects {v.expectedInterval}ly
                  </Badge>
                  {v.priceId && (
                    <code className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      {v.priceId}
                    </code>
                  )}
                </div>
                {v.ok ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                    ✓ Active recurring {v.interval}ly price in {(v.mode || '?').toUpperCase()} mode
                    {typeof v.amount === 'number' && v.currency
                      ? ` · ${(v.amount / 100).toFixed(2)} ${v.currency.toUpperCase()}`
                      : ''}
                  </p>
                ) : (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs text-red-700 dark:text-red-300">
                      {v.errorMessage || 'Validation failed'}
                    </p>
                    {(v.exists || v.httpStatus) && (
                      <div className="flex flex-wrap gap-1.5">
                        {v.exists && (
                          <Badge variant="outline" className="text-[10px]">
                            exists
                          </Badge>
                        )}
                        {v.active !== null && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${v.active ? '' : 'border-red-300 text-red-700'}`}
                          >
                            active={String(v.active)}
                          </Badge>
                        )}
                        {v.recurring !== null && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${v.recurring ? '' : 'border-red-300 text-red-700'}`}
                          >
                            recurring={String(v.recurring)}
                          </Badge>
                        )}
                        {v.interval && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              v.interval === v.expectedInterval
                                ? ''
                                : 'border-red-300 text-red-700'
                            }`}
                          >
                            interval={v.interval}
                          </Badge>
                        )}
                        {v.mode && (
                          <Badge variant="outline" className="text-[10px]">
                            mode={v.mode}
                          </Badge>
                        )}
                        {v.errorCode && (
                          <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">
                            {v.errorCode}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
