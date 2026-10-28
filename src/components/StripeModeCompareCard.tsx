import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  RefreshCw,
  GitCompare,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  ArrowRightLeft,
  Plus,
  Minus,
  Equal,
} from 'lucide-react';

interface SimplePrice {
  id: string;
  nickname: string | null;
  unit_amount: number | null;
  currency: string;
  active: boolean;
  recurring: { interval: string; interval_count: number } | null;
  product_id: string;
}

interface SimpleProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  prices: SimplePrice[];
}

interface PriceComparisonRow {
  signature: string;
  label: string;
  test: SimplePrice | null;
  live: SimplePrice | null;
  missingIn: 'test' | 'live' | null;
}

interface MatchedProduct {
  name: string;
  test: SimpleProduct | null;
  live: SimpleProduct | null;
  priceComparison: PriceComparisonRow[];
}

interface CompareResponse {
  testAvailable: boolean;
  liveAvailable: boolean;
  testKeySource: string;
  liveKeySource: string;
  testProductCount: number;
  liveProductCount: number;
  matched: MatchedProduct[];
  summary: {
    missingInTest: number;
    missingInLive: number;
    productsOnlyInTest: number;
    productsOnlyInLive: number;
  };
}

interface CloneResponse {
  targetMode: 'test' | 'live';
  sourceMode: 'test' | 'live';
  created: Array<{
    productName: string;
    sourcePriceId: string;
    targetPriceId: string;
    targetProductId: string;
    description: string;
    productAction: 'reused' | 'created';
  }>;
  skipped: Array<{ productName: string; sourcePriceId: string; reason: string }>;
  errors: Array<{ productName: string; sourcePriceId: string; error: string }>;
  summary: { createdCount: number; skippedCount: number; errorCount: number };
  suggestedEnv: string | null;
  message: string;
}

function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-700"
      title="Copy to clipboard"
    >
      <Copy className="h-3 w-3" />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function PriceCell({ price, otherSideExists }: { price: SimplePrice | null; otherSideExists: boolean }) {
  if (price) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded break-all">
            {price.id}
          </code>
          <CopyInline text={price.id} />
        </div>
        {price.nickname && (
          <div className="text-[10px] text-slate-500 italic">"{price.nickname}"</div>
        )}
        {!price.active && (
          <Badge variant="secondary" className="text-[9px] py-0 h-4">
            inactive
          </Badge>
        )}
      </div>
    );
  }
  if (otherSideExists) {
    return (
      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
        <Minus className="h-3.5 w-3.5" />
        <span className="text-xs italic">Missing — will clone</span>
      </div>
    );
  }
  return <span className="text-xs text-slate-400 italic">—</span>;
}

export default function StripeModeCompareCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<CompareResponse | null>(null);

  const [testKeyOverride, setTestKeyOverride] = useState('');
  const [liveKeyOverride, setLiveKeyOverride] = useState('');

  const [cloning, setCloning] = useState(false);
  const [cloneResult, setCloneResult] = useState<CloneResponse | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<'test' | 'live' | null>(null);

  const runCompare = async () => {
    setLoading(true);
    setError(null);
    setCompare(null);
    setCloneResult(null);
    setCloneError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('stripe-autofix', {
        body: {
          action: 'compare-modes',
          testSecretKey: testKeyOverride || undefined,
          liveSecretKey: liveKeyOverride || undefined,
        },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      setCompare(data as CompareResponse);
    } catch (err) {
      setError((err as Error).message || 'Compare failed');
    } finally {
      setLoading(false);
    }
  };

  const runClone = async (targetMode: 'test' | 'live') => {
    setCloning(true);
    setCloneError(null);
    setCloneResult(null);
    setConfirmTarget(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('stripe-autofix', {
        body: {
          action: 'clone-prices',
          targetMode,
          testSecretKey: testKeyOverride || undefined,
          liveSecretKey: liveKeyOverride || undefined,
        },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      setCloneResult(data as CloneResponse);
      // Refresh comparison so the UI reflects the newly-created prices
      await runCompare();
    } catch (err) {
      setCloneError((err as Error).message || 'Clone failed');
    } finally {
      setCloning(false);
    }
  };

  const totalMismatches = compare
    ? compare.summary.missingInTest + compare.summary.missingInLive
    : 0;

  return (
    <Card className="border-2 border-purple-200 dark:border-purple-900 bg-gradient-to-br from-purple-50/50 to-indigo-50/30 dark:from-purple-950/20 dark:to-indigo-950/10 mb-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-purple-600 flex items-center justify-center">
                <GitCompare className="h-4 w-4 text-white" />
              </div>
              Compare modes &amp; clone prices
              <Badge variant="secondary" className="ml-1">
                <ArrowRightLeft className="h-3 w-3 mr-1" />
                Test ↔ Live
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Side-by-side view of products and prices in your test vs live Stripe accounts. When
              you decide which mode to standardize on, one click clones any missing prices from the
              other side (matched by product name).
            </CardDescription>
          </div>
          <Button onClick={runCompare} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" /> Compare modes
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Optional secret-key overrides */}
        <details className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
            Optional: provide secret keys for both modes (only needed if not configured as Edge
            Function Secrets)
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="test-key" className="text-xs">
                Test mode secret key
              </Label>
              <Input
                id="test-key"
                type="password"
                value={testKeyOverride}
                onChange={(e) => setTestKeyOverride(e.target.value)}
                placeholder="sk_test_..."
                className="font-mono text-xs mt-1"
              />
            </div>
            <div>
              <Label htmlFor="live-key" className="text-xs">
                Live mode secret key
              </Label>
              <Input
                id="live-key"
                type="password"
                value={liveKeyOverride}
                onChange={(e) => setLiveKeyOverride(e.target.value)}
                placeholder="sk_live_..."
                className="font-mono text-xs mt-1"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            For permanent setup, add <code>STRIPE_SECRET_KEY_TEST</code> and{' '}
            <code>STRIPE_SECRET_KEY_LIVE</code> to your Edge Function Secrets. Keys entered here
            are sent to the edge function for this single request and are not stored.
          </p>
        </details>

        {error && (
          <Alert className="border-red-300 bg-red-50 dark:bg-red-950/30">
            <XCircle className="h-4 w-4 text-red-600" />
            <AlertTitle>Compare failed</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {compare === null && !loading && !error && (
          <div className="rounded-lg border-2 border-dashed border-purple-200 dark:border-purple-900 p-6 text-center">
            <GitCompare className="h-8 w-8 text-purple-500 mx-auto mb-2" />
            <p className="text-sm font-medium">Click "Compare modes" to load both catalogs</p>
            <p className="text-xs text-slate-500 mt-1">
              We'll fetch products + prices from your test and live Stripe accounts and show them
              side-by-side.
            </p>
          </div>
        )}

        {compare && (
          <>
            {/* Availability banner */}
            <div className="grid gap-2 sm:grid-cols-2">
              <ModeAvailability
                label="Test mode"
                available={compare.testAvailable}
                source={compare.testKeySource}
                productCount={compare.testProductCount}
              />
              <ModeAvailability
                label="Live mode"
                available={compare.liveAvailable}
                source={compare.liveKeySource}
                productCount={compare.liveProductCount}
              />
            </div>

            {/* Summary */}
            <div className="flex items-center gap-2 flex-wrap">
              {totalMismatches === 0 ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Catalogs are in sync
                </Badge>
              ) : (
                <>
                  {compare.summary.missingInLive > 0 && (
                    <Badge variant="destructive">
                      {compare.summary.missingInLive} missing in LIVE
                    </Badge>
                  )}
                  {compare.summary.missingInTest > 0 && (
                    <Badge className="bg-amber-500 hover:bg-amber-500">
                      {compare.summary.missingInTest} missing in TEST
                    </Badge>
                  )}
                </>
              )}
              <span className="text-xs text-slate-500">
                {compare.matched.length} product{compare.matched.length === 1 ? '' : 's'} compared
              </span>
            </div>

            {/* Comparison table */}
            {compare.matched.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No products found</AlertTitle>
                <AlertDescription className="text-xs">
                  Neither account contains active products. Create some in the Stripe Dashboard
                  first, then re-run compare.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="rounded-lg border bg-white dark:bg-slate-900/60 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400 border-b">
                  <div className="col-span-4">Product / Price</div>
                  <div className="col-span-4 flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                      TEST
                    </span>
                  </div>
                  <div className="col-span-4 flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                      LIVE
                    </span>
                  </div>
                </div>

                <div className="divide-y">
                  {compare.matched.map((m) => (
                    <ProductCompareRow key={m.name} product={m} />
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            {compare.testAvailable && compare.liveAvailable && totalMismatches > 0 && (
              <div className="rounded-lg border-2 border-purple-300 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/20 p-4">
                <div className="flex items-start gap-2 mb-3">
                  <ArrowRightLeft className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">Pick which mode to standardize on</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      The chosen target will receive any missing prices, cloned from the other side
                      (matched by product name + amount + interval). Existing prices are never
                      modified.
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant={confirmTarget === 'test' ? 'default' : 'outline'}
                    disabled={cloning || compare.summary.missingInTest === 0}
                    onClick={() =>
                      confirmTarget === 'test' ? runClone('test') : setConfirmTarget('test')
                    }
                    className={confirmTarget === 'test' ? 'bg-amber-600 hover:bg-amber-700' : ''}
                  >
                    {cloning && confirmTarget === null ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    {confirmTarget === 'test'
                      ? `Confirm: clone ${compare.summary.missingInTest} into TEST`
                      : `Standardize on TEST (clone ${compare.summary.missingInTest})`}
                  </Button>
                  <Button
                    variant={confirmTarget === 'live' ? 'default' : 'outline'}
                    disabled={cloning || compare.summary.missingInLive === 0}
                    onClick={() =>
                      confirmTarget === 'live' ? runClone('live') : setConfirmTarget('live')
                    }
                    className={confirmTarget === 'live' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                  >
                    {cloning && confirmTarget === null ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    {confirmTarget === 'live'
                      ? `Confirm: clone ${compare.summary.missingInLive} into LIVE`
                      : `Standardize on LIVE (clone ${compare.summary.missingInLive})`}
                  </Button>
                </div>

                {confirmTarget && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-2 italic">
                    Click the {confirmTarget.toUpperCase()} button again to confirm. This is a
                    one-way operation — newly created prices cannot be deleted from Stripe (only
                    archived).
                  </p>
                )}

                {cloning && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cloning prices… this may take a few seconds.
                  </div>
                )}
              </div>
            )}

            {/* Clone result */}
            {cloneError && (
              <Alert className="border-red-300 bg-red-50 dark:bg-red-950/30">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertTitle>Clone failed</AlertTitle>
                <AlertDescription className="text-xs">{cloneError}</AlertDescription>
              </Alert>
            )}

            {cloneResult && (
              <Alert
                className={
                  cloneResult.summary.errorCount > 0
                    ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30'
                    : 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30'
                }
              >
                <CheckCircle2
                  className={`h-5 w-5 ${
                    cloneResult.summary.errorCount > 0 ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                />
                <AlertTitle>
                  Cloned {cloneResult.summary.createdCount} → {cloneResult.targetMode.toUpperCase()}
                  {cloneResult.summary.errorCount > 0
                    ? ` (${cloneResult.summary.errorCount} error${
                        cloneResult.summary.errorCount === 1 ? '' : 's'
                      })`
                    : ''}
                </AlertTitle>
                <AlertDescription className="text-xs space-y-2">
                  <div>{cloneResult.message}</div>

                  {cloneResult.created.length > 0 && (
                    <div className="bg-white/60 dark:bg-slate-900/40 rounded p-2 space-y-1">
                      <div className="font-semibold">Created:</div>
                      {cloneResult.created.slice(0, 10).map((c) => (
                        <div key={c.targetPriceId} className="flex items-center gap-1.5 flex-wrap">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                          <span>{c.productName}</span>
                          <span className="text-slate-500">— {c.description} →</span>
                          <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">
                            {c.targetPriceId}
                          </code>
                          <CopyInline text={c.targetPriceId} />
                          {c.productAction === 'created' && (
                            <Badge variant="outline" className="text-[9px] py-0 h-4">
                              new product
                            </Badge>
                          )}
                        </div>
                      ))}
                      {cloneResult.created.length > 10 && (
                        <div className="text-slate-500 italic">
                          …and {cloneResult.created.length - 10} more
                        </div>
                      )}
                    </div>
                  )}

                  {cloneResult.errors.length > 0 && (
                    <div className="bg-red-100/60 dark:bg-red-950/40 rounded p-2 space-y-1">
                      <div className="font-semibold text-red-700 dark:text-red-300">Errors:</div>
                      {cloneResult.errors.map((e, i) => (
                        <div key={i} className="text-red-700 dark:text-red-300">
                          {e.productName} ({e.sourcePriceId}): {e.error}
                        </div>
                      ))}
                    </div>
                  )}

                  {cloneResult.suggestedEnv && (
                    <div className="bg-slate-900 text-slate-100 rounded p-2 font-mono text-[11px]">
                      <div className="text-emerald-300 mb-1 flex items-center justify-between gap-2">
                        <span>
                          Suggested .env values for{' '}
                          {cloneResult.targetMode.toUpperCase()} mode:
                        </span>
                        <CopyInline text={cloneResult.suggestedEnv} />
                      </div>
                      <pre className="whitespace-pre-wrap break-all">
                        {cloneResult.suggestedEnv}
                      </pre>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ModeAvailability({
  label,
  available,
  source,
  productCount,
}: {
  label: string;
  available: boolean;
  source: string;
  productCount: number;
}) {
  return (
    <div
      className={`flex items-start gap-2 p-2 rounded border text-xs ${
        available
          ? 'border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20'
          : 'border-slate-200 bg-slate-50/60 dark:bg-slate-900/40'
      }`}
    >
      {available ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold">
          {label}{' '}
          <span className="text-slate-500 font-normal">
            ({available ? `${productCount} product${productCount === 1 ? '' : 's'}` : 'no key'})
          </span>
        </div>
        {available ? (
          <div className="text-[10px] text-slate-500">key from: {source}</div>
        ) : (
          <div className="text-[10px] text-slate-500">
            Add a secret key (env or override) to compare this side
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCompareRow({ product }: { product: MatchedProduct }) {
  const [expanded, setExpanded] = useState(true);
  const missingCount = product.priceComparison.filter((c) => c.missingIn).length;
  const hasBothSides = product.test && product.live;
  const onlyOneSide = !product.test || !product.live;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full grid grid-cols-12 gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-left items-center"
      >
        <div className="col-span-4 flex items-center gap-2 min-w-0">
          {missingCount === 0 && hasBothSides ? (
            <Equal className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <ArrowRightLeft className="h-4 w-4 text-amber-600 shrink-0" />
          )}
          <span className="font-semibold text-sm truncate">{product.name}</span>
          {missingCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 h-4 border-amber-400 text-amber-700 dark:text-amber-400 shrink-0"
            >
              {missingCount} mismatch
            </Badge>
          )}
          {onlyOneSide && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 h-4 border-purple-400 text-purple-700 dark:text-purple-400 shrink-0"
            >
              one-side only
            </Badge>
          )}
        </div>
        <div className="col-span-4 text-xs text-slate-600 dark:text-slate-400 truncate">
          {product.test ? (
            <span>
              <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded">
                {product.test.id}
              </code>{' '}
              · {product.test.prices.length} price{product.test.prices.length === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="text-amber-600 italic">— not in test —</span>
          )}
        </div>
        <div className="col-span-4 text-xs text-slate-600 dark:text-slate-400 truncate">
          {product.live ? (
            <span>
              <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded">
                {product.live.id}
              </code>{' '}
              · {product.live.prices.length} price{product.live.prices.length === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="text-amber-600 italic">— not in live —</span>
          )}
        </div>
      </button>

      {expanded && product.priceComparison.length > 0 && (
        <div className="bg-slate-50/60 dark:bg-slate-900/40 border-t">
          {product.priceComparison.map((row) => (
            <div
              key={row.signature}
              className="grid grid-cols-12 gap-2 px-3 py-2 border-t first:border-t-0 text-xs"
            >
              <div className="col-span-4 flex items-center gap-1.5 pl-6">
                <span className="text-slate-700 dark:text-slate-300 font-medium">{row.label}</span>
              </div>
              <div className="col-span-4">
                <PriceCell price={row.test} otherSideExists={!!row.live} />
              </div>
              <div className="col-span-4">
                <PriceCell price={row.live} otherSideExists={!!row.test} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
