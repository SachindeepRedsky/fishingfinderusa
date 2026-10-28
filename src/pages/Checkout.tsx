import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { isSubscriptionEntitled } from '@/data/fishingSpots';
import { PLANS, STRIPE_TEST_MODE, STRIPE_CONFIG_VALID, STRIPE_CONFIG_ERROR } from '@/lib/stripe';

import { Button } from '@/components/ui/button';
import AuthModal from '@/components/AuthModal';
import WalletButtonsPreview from '@/components/WalletButtonsPreview';
import CheckoutHealthCheck from '@/components/CheckoutHealthCheck';
import InlineCardCheckout from '@/components/InlineCardCheckout';
import {
  Fish, Crown, Check, ArrowLeft, Loader2, Shield, Lock,
  Calendar, Star, Zap, Award, Hotel, Cloud, Camera, Heart, AlertTriangle, ExternalLink,
  CreditCard,
} from 'lucide-react';



// ===== Main Checkout Page =====
// This page no longer collects card details inline. It launches a Stripe-hosted
// Checkout Session via the `create-checkout-session` edge function, which uses
// the server-side STRIPE_SECRET_KEY (configured as a Supabase secret) to talk
// to Stripe. The browser only ever sees the redirect URL.
const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planParam = (searchParams.get('plan') === 'monthly' ? 'monthly' : 'yearly') as 'monthly' | 'yearly';
  const wasCanceled = searchParams.get('canceled') === '1';

  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>(planParam);

  const [redirecting, setRedirecting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [existingSub, setExistingSub] = useState<any>(null);
  // Default to the inline card form so users see Visa/MC/Amex fields right
  // in the page (no redirect required). They can switch to the hosted Stripe
  // checkout page if they prefer.
  const [paymentMode, setPaymentMode] = useState<'card' | 'hosted'>('card');




  // Check auth & existing subscription
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const { data: subscriptions } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', session.user.id)
          .in('status', ['active', 'trialing']);
        const activeSubscription = (subscriptions || []).find(isSubscriptionEntitled);
        if (activeSubscription) setExistingSub(activeSubscription);
      } else {
        setShowAuthModal(true);
      }
      setAuthChecked(true);
    };
    init();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) {
        setUser(session.user);
        setShowAuthModal(false);
      } else {
        setUser(null);
      }
    });
    return () => authSub.unsubscribe();
  }, []);

  // Launch Stripe Checkout via the secure edge function.
  //
  // IMPORTANT: When the edge function returns a non-2xx status, the
  // supabase-js wrapper produces a generic "Edge Function returned a
  // non-2xx status code" message that HIDES the real reason. We need
  // the real reason (e.g. "STRIPE_SECRET_KEY is not configured") so the
  // user can actually fix it. So when fnError is present, we re-issue
  // the same call with raw fetch to read the JSON error body.
  const handleCheckout = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    setRedirecting(true);
    setCheckoutError(null);

    const requestBody = {
      plan: selectedPlan,
      priceId: PLANS[selectedPlan].priceId,
      email: user.email,
      userId: user.id,
      successUrl: `${window.location.origin}/checkout/success?plan=${selectedPlan}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${window.location.origin}/checkout?plan=${selectedPlan}&canceled=1`,
    };

    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout-session', {
        body: requestBody,
      });

      // If supabase wrapper reported an error, fetch the raw body so we
      // can read the real server-side error message instead of the
      // useless generic "non-2xx" string.
      if (fnError) {
        let realError: string | null = null;
        try {
          const supabaseUrl = (supabase as any).supabaseUrl as string;
          const anonKey = (supabase as any).supabaseKey as string;
          const fnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/create-checkout-session`;
          const session = await supabase.auth.getSession();
          const accessToken = session.data.session?.access_token || anonKey;
          const raw = await fetch(fnUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: anonKey,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(requestBody),
          });
          const bodyText = await raw.text();
          try {
            const parsed = JSON.parse(bodyText);
            realError = parsed?.error || parsed?.message || bodyText.slice(0, 400);
          } catch {
            realError = bodyText.slice(0, 400);
          }
        } catch {
          // ignore — fall back to generic message
        }
        throw new Error(realError || fnError.message || 'Failed to start checkout');
      }

      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error('No checkout URL returned by the server.');

      // Hand off to Stripe-hosted checkout
      window.location.href = data.url;
    } catch (err: any) {
      setCheckoutError(err?.message || 'Could not start checkout. Please try again.');
      setRedirecting(false);
    }
  };





  const planDetails = PLANS[selectedPlan];
  const monthlyEquivalent = selectedPlan === 'yearly' ? (79.99 / 12).toFixed(2) : '9.99';
  const taxAmount = (planDetails.priceAmount * 0).toFixed(2); // No tax for now
  const total = planDetails.priceAmount.toFixed(2);

  const proFeatures = [
    { icon: Heart, text: 'Unlimited favorite spots' },
    { icon: Camera, text: 'Photo catch log' },
    { icon: Calendar, text: 'Trip planner & sharing' },
    { icon: Cloud, text: 'Real-time weather data' },
    { icon: Hotel, text: 'Lodging reviews' },
    { icon: Award, text: 'Priority support' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition">
            <Button onClick={() => navigate('/pricing')} variant="ghost" className="text-blue-200 hover:text-white hover:bg-blue-500/20 md:hidden flex">
              <ArrowLeft className="w-4 h-4 mr-2" />
            </Button>
            <div className="p-2 rounded-lg">
              <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">FishingFinderUSA</h1>
              <p className="text-blue-300 text-xs">Secure Checkout</p>
            </div>
          </button>
          <Button onClick={() => navigate('/pricing')} variant="ghost" className="text-blue-200 hover:text-white hover:bg-blue-500/20 md:flex hidden">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Pricing
          </Button>
        </div>
      </header>

      {/* Test Mode Banner */}
      {STRIPE_TEST_MODE && (
        <div className="bg-gradient-to-r from-yellow-500/20 via-amber-500/20 to-yellow-500/20 border-b border-yellow-500/40">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center gap-2 text-yellow-200 text-sm">
            <Zap className="w-4 h-4 text-yellow-300" />
            <span className="font-semibold">TEST MODE</span>
            <span className="text-yellow-300/70 hidden sm:inline">
              — Use test card <span className="font-mono bg-yellow-500/20 px-1.5 py-0.5 rounded">4242 4242 4242 4242</span>, any future date, any CVC. No real charges.
            </span>
          </div>
        </div>
      )}

      {/* Stripe Configuration Error Banner */}
      {!STRIPE_CONFIG_VALID && (
        <div className="bg-red-500/15 border-b-2 border-red-500/50">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-red-300 font-bold text-base mb-1">Stripe Configuration Error</h3>
                <p className="text-red-200/90 text-sm mb-2">{STRIPE_CONFIG_ERROR}</p>
                <details className="text-xs text-red-200/70">
                  <summary className="cursor-pointer hover:text-red-200 font-medium">How to fix this</summary>
                  <ol className="mt-2 ml-4 list-decimal space-y-1">
                    <li>Set <span className="font-mono bg-red-500/20 px-1.5 py-0.5 rounded">VITE_STRIPE_PUBLISHABLE_KEY</span>, <span className="font-mono">VITE_STRIPE_PRICE_MONTHLY</span>, and <span className="font-mono">VITE_STRIPE_PRICE_YEARLY</span> in your <span className="font-mono">.env</span> file</li>
                    <li>Set <span className="font-mono">STRIPE_SECRET_KEY</span> as a Supabase Edge Function <strong>secret</strong> (NOT in <span className="font-mono">.env</span> or anywhere in the repo)</li>
                    <li>Optionally set <span className="font-mono">STRIPE_PRICE_MONTHLY</span> / <span className="font-mono">STRIPE_PRICE_YEARLY</span> as edge function secrets too</li>
                    <li>Get all keys from <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer" className="underline hover:text-red-100">dashboard.stripe.com/apikeys</a></li>
                  </ol>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Canceled banner */}
      {wasCanceled && !checkoutError && (
        <div className="bg-amber-500/15 border-b border-amber-500/40">
          <div className="max-w-5xl mx-auto px-4 py-3 text-center text-amber-200 text-sm">
            Your checkout was canceled. No charge was made — you can try again whenever you're ready.
          </div>
        </div>
      )}



      {/* Progress Indicator */}
      <div className="max-w-5xl mx-auto px-4 pt-8">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm text-gray-300 hidden sm:inline">Plan</span>
          </div>
          <div className="w-12 h-0.5 bg-amber-500"></div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center">
              <span className="text-white text-sm font-bold">2</span>
            </div>
            <span className="text-sm text-white font-medium hidden sm:inline">Payment</span>
          </div>
          <div className="w-12 h-0.5 bg-slate-600"></div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
              <span className="text-gray-400 text-sm font-bold">3</span>
            </div>
            <span className="text-sm text-gray-400 hidden sm:inline">Confirm</span>
          </div>
        </div>
      </div>

      {/* Already Subscribed State */}
      {existingSub && (
        <div className="max-w-2xl mx-auto px-4 pb-20">
          <div className="bg-slate-800/60 rounded-2xl border border-amber-500/30 p-8 text-center">
            <Crown className="w-16 h-16 text-amber-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">You're Already a Pro Member!</h2>
            <p className="text-gray-400 mb-6">
              Your {existingSub.plan === 'pro_yearly' ? 'Yearly' : 'Monthly'} subscription is active.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => navigate('/')} className="bg-blue-500 hover:bg-blue-600 text-white">
                Go to App
              </Button>
              <Button onClick={() => navigate('/my-trips')} variant="outline" className="border-slate-600 text-gray-300">
                View My Trips
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Checkout Content */}
      {!existingSub && (
        <div className="max-w-6xl mx-auto px-4 pb-16">
          {/* LIVE health-check banner: tells the user RIGHT NOW whether their
              Stripe secrets are reaching the edge function, so they don't have
              to attempt a checkout and decode a 500 error. Auto-runs on mount. */}
          {STRIPE_CONFIG_VALID && user && <CheckoutHealthCheck />}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

            {/* LEFT: Plan picker + Continue button */}
            <div className="lg:col-span-3">
              <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-6 md:p-8">
                <h2 className="text-2xl font-bold text-white mb-2">Complete Your Subscription</h2>
                <p className="text-gray-400 mb-6">Secure payment powered by Stripe</p>

                {/* Plan Selector */}
                <div className="mb-6">
                  <label className="text-sm font-medium text-gray-300 mb-3 block">Select billing cycle</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedPlan('monthly')}
                      className={`relative rounded-xl p-4 text-left transition-all border-2 ${
                        selectedPlan === 'monthly'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                      }`}
                    >
                      <div className="text-sm text-gray-400 mb-1">Monthly</div>
                      <div className="text-2xl font-bold text-white">$9.99<span className="text-sm text-gray-400 font-normal">/mo</span></div>
                      {selectedPlan === 'monthly' && (
                        <div className="absolute top-3 right-3 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPlan('yearly')}
                      className={`relative rounded-xl p-4 text-left transition-all border-2 ${
                        selectedPlan === 'yearly'
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                      }`}
                    >
                      <div className="absolute -top-2.5 right-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        SAVE 33%
                      </div>
                      <div className="text-sm text-gray-400 mb-1">Yearly</div>
                      <div className="text-2xl font-bold text-white">$79.99<span className="text-sm text-gray-400 font-normal">/yr</span></div>
                      {selectedPlan === 'yearly' && (
                        <div className="absolute top-3 right-3 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Account Info */}
                {user && (
                  <div className="mb-6 bg-slate-900/40 rounded-lg p-4 border border-slate-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Account</p>
                        <p className="text-white text-sm md:font-medium">{user.email}</p>
                      </div>
                      <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 font-semibold">
                        {user.email?.[0]?.toUpperCase()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Auth required */}
                {authChecked && !user && STRIPE_CONFIG_VALID && (
                  <div className="text-center py-12">
                    <Lock className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                    <h3 className="text-white font-semibold mb-2">Sign in to continue</h3>
                    <p className="text-gray-400 mb-4 text-sm">You need an account to subscribe to Pro</p>
                    <Button onClick={() => setShowAuthModal(true)} className="bg-blue-500 hover:bg-blue-600 text-white">
                      Sign In or Create Account
                    </Button>
                  </div>
                )}

                {/* Stripe Config Invalid */}
                {!STRIPE_CONFIG_VALID && (
                  <div className="text-center py-10 border-2 border-dashed border-red-500/30 rounded-xl bg-red-500/5">
                    <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                    <h3 className="text-red-300 font-semibold mb-2">Payment unavailable</h3>
                    <p className="text-red-200/70 text-sm max-w-sm mx-auto">
                      Stripe isn't configured correctly. See the red banner at the top of this page for details on how to fix it.
                    </p>
                  </div>
                )}

                {/* Continue to Stripe Checkout */}
                {user && STRIPE_CONFIG_VALID && (
                  <div className="space-y-4">
                    {checkoutError && (() => {
                      const errLower = checkoutError.toLowerCase();
                      const isMissingSecret =
                        errLower.includes('stripe_secret_key') ||
                        errLower.includes('not configured') ||
                        errLower.includes('missing');
                      const isPriceIssue =
                        errLower.includes('price') ||
                        errLower.includes('priceid');
                      const isStripeApiIssue =
                        errLower.includes('invalid api key') ||
                        errLower.includes('no such price') ||
                        errLower.includes('stripe returned');

                      return (
                        <div className="bg-red-500/10 border-2 border-red-500/40 rounded-lg p-4 space-y-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-red-300 font-semibold text-sm mb-1">
                                Checkout could not start
                              </h4>
                              <p className="text-red-200/90 text-xs break-words">
                                {checkoutError}
                              </p>
                            </div>
                          </div>

                          {isMissingSecret && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-xs text-red-100/90 space-y-2">
                              <p className="font-semibold text-red-200">
                                Why this is happening:
                              </p>
                              <p>
                                Your Stripe API keys haven't been added to Supabase
                                yet. The Auto-fix tool can detect this, but it
                                <strong> cannot install secrets for you</strong> —
                                Supabase only allows the project owner to do that
                                from the dashboard for security reasons.
                              </p>
                              <p className="font-semibold text-red-200 pt-1">
                                Fix it in 2 minutes:
                              </p>
                              <ol className="ml-4 list-decimal space-y-1">
                                <li>
                                  Get your <strong>Secret key</strong> (starts with{' '}
                                  <code className="font-mono bg-red-500/20 px-1 rounded">sk_test_</code>{' '}
                                  or{' '}
                                  <code className="font-mono bg-red-500/20 px-1 rounded">sk_live_</code>)
                                  from{' '}
                                  <a
                                    href="https://dashboard.stripe.com/apikeys"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline hover:text-white"
                                  >
                                    dashboard.stripe.com/apikeys
                                  </a>
                                </li>
                                <li>
                                  Open your Supabase project →{' '}
                                  <strong>Project Settings → Edge Functions → Secrets</strong>
                                </li>
                                <li>
                                  Add a secret named{' '}
                                  <code className="font-mono bg-red-500/20 px-1 rounded">STRIPE_SECRET_KEY</code>{' '}
                                  with the value from step&nbsp;1
                                </li>
                                <li>
                                  Also add{' '}
                                  <code className="font-mono bg-red-500/20 px-1 rounded">STRIPE_PRICE_MONTHLY</code>,{' '}
                                  <code className="font-mono bg-red-500/20 px-1 rounded">STRIPE_PRICE_YEARLY</code>,
                                  and{' '}
                                  <code className="font-mono bg-red-500/20 px-1 rounded">STRIPE_WEBHOOK_SECRET</code>
                                </li>
                                <li>Reload this page and try checkout again</li>
                              </ol>
                            </div>
                          )}

                          {isPriceIssue && !isMissingSecret && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-xs text-red-100/90">
                              <p>
                                The price ID is missing or invalid. Open the{' '}
                                <strong>Stripe Setup</strong> page below to verify
                                that your price IDs match the live/test mode of
                                your secret key.
                              </p>
                            </div>
                          )}

                          {isStripeApiIssue && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-xs text-red-100/90">
                              <p>
                                Stripe rejected the request. This is usually a
                                wrong key (test vs live) or a price that doesn't
                                exist in the connected account. Run the diagnostic
                                on the Stripe Setup page below.
                              </p>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => navigate('/admin/stripe-setup')}

                              className="bg-red-500 hover:bg-red-600 text-white text-xs h-8"
                            >
                              Open Stripe Setup &amp; Auto-fix
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setCheckoutError(null)}
                              className="border-red-500/40 text-red-200 hover:bg-red-500/10 text-xs h-8"
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      );
                    })()}

                    <WalletButtonsPreview />

                    {/* Payment Method Tabs — Card (inline) vs Hosted Stripe page */}
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900/60 rounded-lg border border-slate-700">
                      <button
                        type="button"
                        onClick={() => setPaymentMode('card')}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs md:text-sm font-medium transition ${
                          paymentMode === 'card'
                            ? 'bg-slate-700 text-white shadow'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        <CreditCard className="w-4 h-4" />
                        Credit / Debit Card
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMode('hosted')}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs md:text-sm font-medium transition ${
                          paymentMode === 'hosted'
                            ? 'bg-slate-700 text-white shadow'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        <ExternalLink className="w-4 h-4" />
                        Stripe Hosted Page
                      </button>
                    </div>

                    {paymentMode === 'card' ? (
                      // ===== Inline Stripe Elements card form =====
                      // Renders Visa / Mastercard / Amex / Discover inputs
                      // directly in the page. Card data is tokenized
                      // client-side by Stripe.js and never touches our server.
                      <div className="bg-slate-900/40 rounded-xl p-5 border border-slate-700">
                        <InlineCardCheckout
                          plan={selectedPlan}
                          user={{ id: user.id, email: user.email }}
                          onSuccess={() => {
                            navigate(`/checkout/success?plan=${selectedPlan}`);
                          }}
                        />
                      </div>
                    ) : (
                      // ===== Stripe-hosted Checkout (redirect) =====
                      <div className="space-y-4">
                        <div className="flex items-start gap-2 text-xs text-gray-400 bg-slate-900/40 p-3 rounded-lg border border-slate-700">
                          <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-400" />
                          <span>
                            You'll be redirected to Stripe's secure checkout to enter your payment details.
                            You'll be charged <span className="text-white font-semibold">{planDetails.price}</span> today and
                            your subscription renews automatically every {planDetails.interval}. Cancel anytime.
                          </span>
                        </div>

                        <Button
                          onClick={handleCheckout}
                          disabled={redirecting}
                          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-6 text-lg rounded-xl shadow-lg shadow-amber-500/30 disabled:opacity-50"
                        >
                          {redirecting ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Redirecting to Stripe...
                            </span>
                          ) : (
                            <span className="flex flex-col items-center">
                              <span className="text-sm md:text-lg">Continue to Secure Checkout</span>
                              <span className="text-sm md:text-lg">Pay {planDetails.price}</span>
                            </span>
                          )}
                        </Button>
                      </div>
                    )}

                    <p className="text-center text-xs text-gray-500">
                      By subscribing, you agree to our Terms of Service and authorize recurring charges.
                    </p>
                  </div>
                )}
              </div>


              {/* Trust badges */}
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700 text-center">
                  <Shield className="w-5 h-5 text-green-400 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">SSL Secured</p>
                </div>
                <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700 text-center">
                  <Lock className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">PCI Compliant</p>
                </div>
                <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700 text-center">
                  <Star className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">Cancel Anytime</p>
                </div>
              </div>
            </div>

            {/* RIGHT: Order Summary */}
            <div className="lg:col-span-2">
              <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-6 lg:sticky lg:top-24">
                <div className="flex items-center gap-3 mb-5">
                  <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-2 rounded-lg">
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Order Summary</h3>
                </div>

                {/* Selected Plan */}
                <div className="bg-slate-900/40 rounded-xl p-4 border border-slate-700 mb-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-white font-semibold">FishingFinderUSA Pro</p>
                      <p className="text-sm text-gray-400">
                        {selectedPlan === 'yearly' ? 'Annual' : 'Monthly'} subscription
                      </p>
                    </div>
                    <span className="text-white font-bold">${total}</span>
                  </div>
                  {selectedPlan === 'yearly' && (
                    <div className="mt-2 inline-flex items-center gap-1 bg-green-500/10 border border-green-500/30 rounded-full px-2.5 py-1">
                      <Check className="w-3 h-3 text-green-400" />
                      <span className="text-xs text-green-400 font-medium">Save $39.89/year</span>
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-2 text-xs text-gray-400">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      Equivalent to <span className="text-white font-medium">${monthlyEquivalent}/month</span>
                    </span>
                  </div>
                </div>

                {/* Pricing breakdown */}
                <div className="space-y-2 py-3 border-y border-slate-700 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Subtotal</span>
                    <span className="text-white">${total}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Tax</span>
                    <span className="text-gray-400">${taxAmount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Discount</span>
                    <span className="text-green-400">{selectedPlan === 'yearly' ? '−$39.89' : '$0.00'}</span>
                  </div>
                </div>

                {/* Total */}
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-white font-semibold text-lg">Total today</span>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">${total}</div>
                    <div className="text-xs text-gray-400">USD</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-5">
                  Renews automatically every {planDetails.interval} at ${total}. Cancel anytime.
                </p>

                {/* What's included */}
                <div className="bg-gradient-to-br from-amber-500/5 to-orange-500/5 rounded-xl p-4 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <h4 className="text-sm font-semibold text-white">What's included</h4>
                  </div>
                  <ul className="space-y-2">
                    {proFeatures.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                        <f.icon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Money back */}
                <div className="mt-4 flex items-start gap-2 bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                  <Shield className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-green-300">
                    <span className="font-semibold">30-day money-back guarantee.</span>{' '}
                    Not satisfied? Get a full refund within 30 days.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-blue-500/20 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-blue-300 text-sm">
          <div className="flex items-center justify-center gap-4 mb-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> SSL Encrypted</span>
            <span>•</span>
            <span>Powered by Stripe</span>
            <span>•</span>
            <span>PCI DSS Compliant</span>
          </div>
          <p>&copy; 2026 FishingFinderUSA. All payments processed securely.</p>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          if (!user) navigate('/pricing');
        }}
        onAuthSuccess={() => {
          setShowAuthModal(false);
        }}
      />
    </div>
  );
};

export default Checkout;
