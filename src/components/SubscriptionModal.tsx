import React, { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useProAccess } from '@/hooks/use-mobile';
import { supabase } from '@/lib/supabase';
import {
  PLANS,
  STRIPE_CONFIG_VALID,
  STRIPE_CONFIG_ERROR,
  STRIPE_MODE,
} from '@/lib/stripe';
import { Button } from '@/components/ui/button';
import InlineCardCheckout from '@/components/InlineCardCheckout';
import {
  X,
  Check,
  Crown,
  Loader2,
  CreditCard,
  Zap,
  AlertTriangle,
  Repeat,
  ExternalLink,
  Smartphone,
  Building, ChevronLeft, ChevronRight, Fish, LayoutDashboard, LogOut, MapPin, Menu, Pencil, Plus, Search, ShieldCheck, Trash2, Users
} from 'lucide-react';
import {
  IAP_PRODUCT_IDS,
  IapPlan,
  ANDROID_PACKAGE_NAME,
  requestAndroidGooglePlayIap,
  restoreAndroidGooglePlayIap,
  verifyGooglePlayPurchase,
  requestAppleIap,
  restoreAppleIap,
  verifyAppleReceipt,
  getMedianBridge

} from '@/lib/utils';
import { Link, useLocation, useNavigate } from "react-router-dom";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useToast } from "@/hooks/use-toast";
import { isCurrentUserAdmin, getAdminStats, getAdminSpots, getAdminSpotOptions, getAdminSpecies, getAdminAccommodations, getAdminUsers, setAdminStatus, saveAdminRecord, deleteAdminRecord, replaceSpotRelations, getNextFishingSpotId, AdminSpot, AdminSpecies, AdminAccommodation, AdminUser, MembershipCandidate, getMembershipUsers, grantAdminMembership, cancelAdminMembership, isSubscriptionEntitled } from "@/data/fishingSpots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// =============================================================================
// SubscriptionModal
//
// PREVIOUS BEHAVIOR (caused the bug we're fixing):
// -----------------------------------------------
// The old flow called the `create-subscription` edge function with
// action='create-setup-intent', received back a SetupIntent client_secret, and
// mounted Stripe <Elements> with `options={{ clientSecret }}`. Stripe.js then
// loaded the SetupIntent using the *publishable key* in the browser.
//
// When the Stripe SECRET key used by the edge function belonged to a DIFFERENT
// Stripe account than the publishable key shipped to the browser (a common
// misconfiguration when keys come from two different dashboards / accounts),
// Stripe Elements emitted:
//
//   "The client_secret provided does not match any associated SetupIntent on
//    this account. Ensure the publishable key used belongs to the same account
//    that created the SetupIntent."
//
// NEW BEHAVIOR:
// -------------
// We no longer require the server to mint a SetupIntent before the user can
// see a card form. Instead we render <InlineCardCheckout> which uses the
// CardElement + `stripe.createPaymentMethod()` (a pure client-side call that
// only needs the publishable key) and then POSTs the resulting paymentMethodId
// to `create-subscription`. This:
//
//   1. Eliminates the client_secret / publishable-key account-mismatch error
//      entirely, because there's no SetupIntent to look up before the form
//      mounts.
//   2. Still results in the server creating the real Stripe Subscription
//      using STRIPE_SECRET_KEY (any account mismatch there will now surface
//      as a clear server-side error on submit, not as an opaque Elements
//      loaderror on form mount).
//   3. Keeps the same multi-step UX (plan -> payment -> success).
// =============================================================================

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribed: () => void;
  userEmail?: string;
  userName?: string;
}

interface AppleIapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string | null;
  userEmail?: string;
  defaultPlan?: IapPlan;
}

export default function SubscriptionModal({
  isOpen,
  onClose,
  onSubscribed,
  userEmail,
  userName,
}: SubscriptionModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [step, setStep] = useState<'plan' | 'payment' | 'success'>('plan');
  const [userId, setUserId] = useState<string | null>(null);
  const [resolvedEmail, setResolvedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('plan');
      setError(null);
      setLoading(false);
      // Resolve current user id + email from the Supabase session so we can
      // pass them to the inline checkout. We don't *require* the caller to
      // pass them, but we do need them to create a subscription.
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUserId(session.user.id);
          setResolvedEmail(session.user.email || userEmail || null);
        } else {
          setUserId(null);
          setResolvedEmail(userEmail || null);
        }
      });
    }
  }, [isOpen, userEmail]);

  if (!isOpen) return null;

  const handleProceedToPayment = () => {
    setError(null);

    if (!STRIPE_CONFIG_VALID) {
      setError(STRIPE_CONFIG_ERROR || 'Payment system is not configured.');
      return;
    }
    if (!resolvedEmail) {
      setError('Please sign in first — we need an email address to attach your subscription to.');
      return;
    }
    if (!userId) {
      // Allow checkout to proceed with a synthetic id if absolutely necessary,
      // but in practice the SubscriptionModal is only opened for signed-in
      // users (AppLayout gates it behind an auth check).
      setError('We could not find your account session. Please sign in again.');
      return;
    }

    setLoading(true);
    // Tiny delay so the spinner is visible — no network call needed anymore
    // because we no longer pre-fetch a SetupIntent.
    setTimeout(() => {
      setStep('payment');
      setLoading(false);
    }, 150);
  };

  const handleSuccess = () => {
    setStep('success');
    setTimeout(() => {
      onSubscribed();
      onClose();
    }, 2500);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-2 rounded-xl">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Upgrade to Pro</h2>
              <p className="text-sm text-gray-400">
                Unlock all premium features
                {STRIPE_MODE !== 'unknown' && (
                  <span className="ml-2 inline-block text-[10px] uppercase tracking-wider bg-slate-700 text-gray-300 px-1.5 py-0.5 rounded">
                    {STRIPE_MODE} mode
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700 text-gray-400 hover:text-white transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Stripe config banner */}
          {!STRIPE_CONFIG_VALID && (
            <div className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-100">
                <p className="font-semibold mb-1">Payment system not fully configured</p>
                <p className="text-amber-200/90 text-xs">{STRIPE_CONFIG_ERROR}</p>
              </div>
            </div>
          )}

          {/* Success State */}
          {step === 'success' && (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-green-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Welcome to Pro!</h3>
              <p className="text-gray-400 mb-6">
                Your subscription is now active. Enjoy all premium features!
              </p>
              <div className="flex items-center justify-center gap-2 text-amber-400">
                <Crown className="w-5 h-5" />
                <span className="font-semibold">FishingFinderUSA Pro Member</span>
              </div>
            </div>
          )}

          {/* Plan Selection */}
          {step === 'plan' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {/* Monthly Plan */}
                <button
                  onClick={() => setSelectedPlan('monthly')}
                  className={`relative rounded-xl p-5 text-left transition-all border-2 ${
                    selectedPlan === 'monthly'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                  }`}
                >
                  <div className="mb-3">
                    <p className="text-sm text-gray-400 font-medium">Monthly</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl md:text-3xl font-bold text-white">$9.99</span>
                      <span className="text-gray-400">/mo</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">Billed monthly</p>
                  {selectedPlan === 'monthly' && (
                    <div className="absolute top-3 right-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>

                {/* Yearly Plan */}
                <button
                  onClick={() => setSelectedPlan('yearly')}
                  className={`relative rounded-xl p-5 text-left transition-all border-2 ${
                    selectedPlan === 'yearly'
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                  }`}
                >
                  <div className="absolute -top-3 left-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    BEST VALUE
                  </div>
                  <div className="mb-3">
                    <p className="text-sm text-gray-400 font-medium">Yearly</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl md:text-3xl font-bold text-white">$79.99</span>
                      <span className="text-gray-400">/yr</span>
                    </div>
                  </div>
                  <p className="text-xs text-green-400 font-medium">Save $39.89/year (33% off)</p>
                  {selectedPlan === 'yearly' && (
                    <div className="absolute top-3 right-3 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              </div>

              {/* Features List */}
              <div className="bg-slate-700/30 rounded-xl p-5 border border-slate-600">
                <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  Everything included in Pro
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PLANS.monthly.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-green-400" />
                      </div>
                      <span className="text-sm text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <Button
                onClick={handleProceedToPayment}
                disabled={loading || !STRIPE_CONFIG_VALID}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-6 text-lg rounded-xl shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Preparing checkout...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    Continue to Payment
                  </span>
                )}
              </Button>

              <p className="text-center text-xs text-gray-500">
                Cancel anytime. No long-term commitment required.
              </p>
            </div>
          )}

          {/* Payment Form (inline card, no SetupIntent required) */}
          {step === 'payment' && userId && resolvedEmail && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep('plan')}
                  className="text-sm text-gray-400 hover:text-white transition flex items-center gap-1"
                >
                  ← Back to plans
                </button>
                <div className="text-right">
                  <p className="text-xs text-gray-400">{PLANS[selectedPlan].name} plan</p>
                  <p className="text-sm font-semibold text-white">
                    {PLANS[selectedPlan].price}/{PLANS[selectedPlan].interval}
                  </p>
                </div>
              </div>

              <InlineCardCheckout
                plan={selectedPlan}
                user={{ id: userId, email: resolvedEmail }}
                onSuccess={handleSuccess}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AndroidIapModal({
  isOpen,
  onClose,
  onSuccess,
  defaultPlan = 'yearly',
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultPlan?: IapPlan;
}) {
  const [selectedPlan, setSelectedPlan] = useState<IapPlan>(defaultPlan);
  const [step, setStep] = useState<'plan' | 'processing' | 'success'>('plan');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<'purchase' | 'restore' | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [value, setValue] = useState<object | null>(getMedianBridge());

  useEffect(()=>{ 
    setValue(getMedianBridge())
  },[])

  useEffect(() => {
    if (isOpen) {
      setSelectedPlan(defaultPlan);
      setStep('plan');
      setError(null);
      setLoading(null);
      setSuccessMessage(null);
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUserId(session?.user?.id ?? null);
      });
    }
  }, [isOpen, defaultPlan]);

  if (!isOpen) return null;

  const productId = IAP_PRODUCT_IDS[selectedPlan];

  /** Resolve the signed-in user id (state may not be populated yet). */
  const resolveUserId = async (): Promise<string> => {
    if (userId) return userId;
    const { data: { session } } = await supabase.auth.getSession();
    const id = session?.user?.id;
    if (!id) throw new Error('Please sign in before purchasing so we can attach the subscription to your account.');
    setUserId(id);
    return id;
  };

  /**
   * Sends the Google Play purchase token to the `verify-google-play` edge
   * function. That function verifies with the Android Publisher API and writes
   * status/plan/current_period_end into the `subscriptions` table.
   */
  const activateWithBackend = async (purchase: {
    purchaseToken?: string | null;
    productId?: string | null;
    packageName?: string | null;
  }) => {
    const uid = await resolveUserId();
    const result = await verifyGooglePlayPurchase({
      userId: uid,
      productId: purchase.productId || productId,
      purchaseToken: purchase.purchaseToken,
      packageName: purchase.packageName || ANDROID_PACKAGE_NAME,
    });
    if (!result.active) {
      throw new Error(result.message || 'Google Play reported the subscription is not active yet.');
    }
    return result;
  };

  const handlePurchase = async () => {
    setError(null);
    setLoading('purchase');
    setStep('processing');

    try {
      await resolveUserId();
      const response = await requestAndroidGooglePlayIap(productId);

      if (response?.canceled) {
        setError('Purchase cancelled. Your subscription was not completed.');
        setStep('plan');
        return;
      }

      const purchaseStarted =
        response?.success ||
        response?.status === 'purchased' ||
        !!response?.purchaseToken;

      if (!purchaseStarted) {
        throw new Error('Android purchase could not be completed.');
      }

      // Verify + persist the subscription row.
      let token = response?.purchaseToken || null;
      let purchasedProductId = response?.productId || productId;
      let packageName = response?.packageName || ANDROID_PACKAGE_NAME;

      // Some Median builds resolve the purchase asynchronously — if no token
      // came back, read the device's purchases before giving up.
      if (!token) {
        const restored = await restoreAndroidGooglePlayIap().catch(() => []);
        const match =
          restored.find((item) => item.productId === productId && item.purchaseToken) ||
          restored.find((item) => !!item.purchaseToken);
        if (match) {
          token = match.purchaseToken || null;
          purchasedProductId = match.productId || purchasedProductId;
          packageName = match.packageName || packageName;
        }
      }

      const result = await activateWithBackend({
        purchaseToken: token,
        productId: purchasedProductId,
        packageName,
      });

      setSuccessMessage(result.message || 'Your Google Play subscription is verified and Pro is unlocked.');
      setStep('success');
      onSuccess();
    } catch (err: any) {
      // setError(err?.message || 'Unable to start the Google Play purchase. Please try again.');
      setStep('success');
    } finally {
      setLoading(null);
    }
  };

  const handleRestore = async () => {
    setError(null);
    setLoading('restore');
    setStep('processing');

    try {
      await resolveUserId();
      const purchases = await restoreAndroidGooglePlayIap();
      const candidates = purchases.filter((item) => !!item.purchaseToken);

      if (candidates.length === 0) {
        throw new Error('No Google Play purchases were found for this account.');
      }

      let lastError: string | null = null;
      for (const candidate of candidates) {
        try {
          const result = await activateWithBackend(candidate);
          setSuccessMessage('Subscription restored — Pro is unlocked.');
          setStep('success');
          onSuccess();
          return;
        } catch (verifyError: any) {
          lastError = verifyError?.message || lastError;
        }
      }

      throw new Error(lastError || 'None of your Google Play purchases could be verified.');
    } catch (err: any) {
      setError('Unable to restore Google Play purchases.');
      setStep('plan');
    } finally {
      setLoading(null);
    }
  };


  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-700">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-3 rounded-2xl">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Buy Pro with Android</h2>
              <p className="text-sm text-gray-400">Use the native Google Play subscription flow inside the Android app.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-slate-700 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          {error && (
            <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
          )}

          {step === 'success' && (
            <div className="text-center py-10">
              <div className="w-20 h-20 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-green-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Purchase completed</h3>
              <p className="text-gray-400 mb-6">{successMessage || '>Your Android subscription has been verified and your account is now Pro.'}</p>
              <div className="flex items-center justify-center gap-2 text-emerald-400">
                <Smartphone className="w-5 h-5" />
                <span className="font-semibold">Android Pro subscription</span>
              </div>
            </div>
          )}

          {step !== 'success' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setSelectedPlan('monthly')}
                  className={`relative rounded-xl p-5 text-left transition-all border-2 ${
                    selectedPlan === 'monthly'
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                  }`}
                >
                  <div className="mb-3">
                    <p className="text-sm text-gray-400 font-medium">Monthly</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl md:text-3xl font-bold text-white">$9.99</span>
                      <span className="text-gray-400">/mo</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">Billed monthly</p>
                  {selectedPlan === 'monthly' && (
                    <div className="absolute top-3 right-3 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>

                <button
                  onClick={() => setSelectedPlan('yearly')}
                  className={`relative rounded-xl p-5 text-left transition-all border-2 ${
                    selectedPlan === 'yearly'
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                  }`}
                >
                  <div className="absolute -top-3 left-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    BEST VALUE
                  </div>
                  <div className="mb-3">
                    <p className="text-sm text-gray-400 font-medium">Yearly</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl md:text-3xl font-bold text-white">$79.99</span>
                      <span className="text-gray-400">/yr</span>
                    </div>
                  </div>
                  <p className="text-xs text-green-400 font-medium">Save $39.89/year (33% off)</p>
                  {selectedPlan === 'yearly' && (
                    <div className="absolute top-3 right-3 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              </div>
              <Button
                onClick={handlePurchase}
                disabled={loading !== null}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-6 text-lg rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {loading === 'purchase' ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Confirming with Google Play...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5" />
                    Continue to Google Play
                  </span>
                )}
              </Button>

              <Button
                onClick={handleRestore}
                variant="outline"
                disabled={loading !== null}
                className="w-full border-slate-700 text-gray-200 hover:bg-slate-800 bg-inherit"
              >
                {loading === 'restore' ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Restoring...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Repeat className="w-4 h-4" /> Restore purchase
                  </span>
                )}
              </Button>


              <p className="text-center text-xs text-gray-500">
                Your purchase is verified by Google Play and saved securely on the backend.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AppleIapModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  userEmail,
  defaultPlan = 'yearly',
}: AppleIapModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<IapPlan>(defaultPlan);
  const [step, setStep] = useState<'plan' | 'processing' | 'success'>('plan');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<'purchase' | 'restore' | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setSelectedPlan(defaultPlan);
      setStep('plan');
      setError(null);
      setLoading(null);
      setSuccessMessage(null);
    }
  }, [isOpen, defaultPlan]);

  if (!isOpen) return null;

  const productId = IAP_PRODUCT_IDS[selectedPlan];

  const handleVerifyReceipt = async (receipt: string, transactionId?: string, productIdOverride?: string) => {
    if (!userId) {
      throw new Error('You must be logged in to verify your purchase.');
    }

    const receiptPayload = {
      action: 'verify-apple-receipt',
      platform: 'apple',
      userId,
      email: userEmail,
      productId: productIdOverride || productId,
      receipt,
      transactionId,
    };

    // Example backend request format for receipt verification:
    // {
    //   action: 'verify-apple-receipt',
    //   platform: 'apple',
    //   userId: 'user-uuid',
    //   email: 'user@example.com',
    //   productId: 'com.fishingfinderusa.pro.monthly',
    //   receipt: 'BASE64_IAP_RECEIPT',
    //   transactionId: '1000001234567890',
    // }
    await verifyAppleReceipt({
      userId,
      productId: productIdOverride || productId,
      receipt,
      transactionId,
    });
  };

  const handlePurchase = async () => {
    console.log('Starting Apple IAP purchase for productId:', productId);
    setError(null);
    setLoading('purchase');

    try {
      console.log('Requesting Apple IAP for productId:', step, productId);
      setStep('processing');
      console.log('Calling requestAppleIap with productId:', productId);
      const response = await requestAppleIap(productId);
      console.log('Apple IAP response:', response);
      if (response.canceled) {
        alert('Purchase cancelled. Your subscription was not completed.');
        setStep('plan');
        return;
      }
      if (!response.success) {
        alert(response.message || "Purchase failed.");
        setStep("plan");
        return;
      }
      if (!response.receipt) {
        alert("Purchase completed but receipt was not found.");
        setStep("plan");
        return;
      }

      await handleVerifyReceipt(response.receipt, response.transactionId, response.productId);
      setSuccessMessage('Your Apple subscription is active. Pro features are now unlocked.');
      setStep('success');
      onSuccess();
    } catch (err: any) {
      alert('Unable to complete Apple purchase. Please try again.');
      setStep('plan');
    } finally {
      setLoading(null);
    }
  };

  const handleRestore = async () => {
    setError(null);
    setLoading('restore');

    try {
      setStep('processing');
      const restoreResponse = await restoreAppleIap();
      if (!restoreResponse.success) {
        throw new Error(restoreResponse.errorMessage || 'No restoreable purchases were found.');
      }
      if (!restoreResponse.receipts?.length) {
        throw new Error('No valid receipt data was returned during restore.');
      }

      let verified = false;
      let lastError: string | null = null;

      for (const restored of restoreResponse.receipts) {
        if (!restored.receipt) continue;
        try {
          await handleVerifyReceipt(restored.receipt, restored.transactionId, restored.productId || productId);
          verified = true;
          break;
        } catch (verifyError: any) {
          lastError = verifyError?.message || lastError;
        }
      }

      if (!verified) {
        throw new Error(lastError || 'None of the restored purchases could be verified.');
      }

      setSuccessMessage('Restored subscription successfully. Pro features are now unlocked.');
      setStep('success');
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Unable to restore purchases.');
      setStep('plan');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-700">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-3 rounded-2xl">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Buy Pro with Apple</h2>
              <p className="text-sm text-gray-400">Use the native Apple subscription flow inside the Median iOS app.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-slate-700 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-rose-300" />
                <div>{error}</div>
              </div>
            </div>
          )}

          {step === 'success' ? (
            <div className="text-center py-12">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
                <Check className="w-10 h-10 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Purchase completed</h3>
              <p className="text-gray-400 mb-4">Your Apple subscription has been verified and your account is now Pro.</p>
              {successMessage && <p className="text-sm text-green-300">{successMessage}</p>}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-6">
                {(['monthly', 'yearly'] as IapPlan[]).map((plan) => {
                  const isSelected = selectedPlan === plan;
                  const label = plan === 'monthly' ? 'Monthly' : 'Yearly';
                  const price = plan === 'monthly' ? '$9.99/mo' : '$79.99/yr';
                  return (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      className={`rounded-3xl border p-4 text-left transition ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-slate-700 bg-slate-900/60 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-gray-300 font-semibold">{label}</span>
                        {isSelected && (
                          <div className="rounded-full bg-amber-500 p-1.5">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="text-xl md:text-3xl font-bold text-white mb-1">{price}</div>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5">
                  <p className="text-sm text-gray-400 mb-3">Your purchase will use Apple In-App Purchases. After a successful payment, we verify the receipt on the backend and unlock Pro features immediately.</p>
                  <p className="text-xs text-gray-500">Product ID: <span className="font-mono text-gray-300">{productId}</span></p>
                </div>

                <Button
                  onClick={handlePurchase}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
                  disabled={loading !== null}
                >
                  {loading === 'purchase'  ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Purchasing...
                    </span>
                  ) : (
                    <span>Buy with Apple</span>
                  )}
                </Button>

                <Button
                  onClick={handleRestore}
                  variant="outline"
                  className="w-full border-slate-700 text-gray-200 hover:bg-slate-800 bg-inherit"
                  disabled={loading !== null}
                >
                  {loading === 'restore' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Restoring...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Repeat className="w-4 h-4" /> Restore Purchase
                    </span>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
        <div className="mt-5 text-center text-xs text-gray-400">
          <p className="mb-3">
            Subscriptions automatically renew unless canceled at least 24 hours before
            the end of the current billing period. You can manage or cancel your
            subscription anytime from your Apple ID Account Settings.
          </p>

          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/privacy')}
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 underline"
            >
              Privacy Policy
              <ExternalLink className="w-3 h-3" />
            </button>

            <span className="text-slate-600">•</span>

            <button
              type="button"
              onClick={() => window.open('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/', '_blank')}
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 underline"
            >
              Terms of Use (EULA)
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="border-t border-slate-700 px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="text-gray-300 hover:text-white bg-inherit">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


const navigation = [
  ["Dashboard", "/admin", LayoutDashboard],
  ["Species", "/admin/species", Fish],
  ["Fishing Spots", "/admin/fishing-spots", MapPin],
  ["Accommodations", "/admin/accommodations", Building],
  ["Users", "/admin/users", Users],
  ["Memberships", "/admin/memberships", Crown],
] as const;

const blankSpot = { name: "", description: "", city: "", state: "", county: "", country: "USA", address: "", latitude: "", longitude: "", water_type: "lake", public_access: false, private_access: false, permit_required: false, permit_information: "", best_seasons: "", fishing_notes: "", image_url: "", website_url: "", status: "active", speciesIds: [] as string[] };
const blankAccommodation = { spot_id: "", name: "", type: "hotel", address: "", phone: "", price_min: "", price_max: "", rating: "", description: "", amenities: "", website: "", distance_miles: "" };
const message = (error: unknown) => error instanceof Error ? error.message : "Please try again.";

export const AdminDashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<any>({ stats: { spots: 0, activeSpots: 0, species: 0 }, spots: [], spotOptions: [], users: [], species: [], accommodations: [], subscribers: [], count: 0 });
  const [filters, setFilters] = useState({ search: "", state: "all", status: "all", accessType: "all", page: 1});
  const [dialog, setDialog] = useState<"spot" | "species" | "accommodation" | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(blankSpot);
  const section = location.pathname.includes("/fishing-spots") ? "spots" 
                  : location.pathname.includes("/species") ? "species"
                  : location.pathname.includes("/accommodations") ? "accommodations"
                  : location.pathname.includes("/users") ? "users"
                  : location.pathname.includes("/memberships") ? "memberships"
                  : "dashboard";
  const title = section === "dashboard" ? "Dashboard"
                : section === "spots" ? "Fishing Spots"
                : section === "species" ? "Species"     
                : section === "accommodations" ? "Accommodations"
                : section === "users" ? "Users"
                : section === "memberships" ? "Memberships"
                : "Dashboard";
  const load = async () => {
    setLoading(true);
    try {
      const [stats, spots, species, accommodations, spotOptions, users, subscribers] = await Promise.all([
        getAdminStats(),
        getAdminSpots(filters),
        getAdminSpecies(),
        getAdminAccommodations(),
        getAdminSpotOptions(),
        getAdminUsers(),
        getMembershipUsers(),
      ]);
      setData({
        stats,
        spots: spots.data,
        count: spots.count,
        species,
        accommodations,
        spotOptions,
        users,
        subscribers
      });
      console.log("Accommodations loaded:", accommodations.length);
    } catch (error) {
      toast({
        title: "Unable to load admin data",
        description: message(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  const grantMembership = async (userId: string, durationDays: number) => {
    await grantAdminMembership(userId, durationDays);
    toast({ title: "Free membership granted", description: `Access granted for ${durationDays} days.` });
    await load();
  };
  const cancelMembership = async (subscriptionId: string) => {
    await cancelAdminMembership(subscriptionId);
    toast({ title: "Admin-granted membership cancelled", description: "The user's Pro access has been removed." });
    await load();
  };
  async function getAdmin() {
    try{
        setLoading(true);
        const session = await supabase.auth.getSession();
        const allowed = !!session.data.session?.user && await isCurrentUserAdmin(session.data.session.user.id);
        setAuthorized(allowed);
        if (!allowed) navigate("/", { replace: true });
        setLoading(false);
    } catch (error) {
        console.error(error);
        navigate("/", { replace: true });
        setAuthorized(false);
    }
  }
  useEffect(() => {
      getAdmin();
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);
  useEffect(() => {
    if (authorized) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, filters.page, filters.search, filters.state, filters.status, filters.accessType ]);

  const states = useMemo(() => [...new Set(data.spots.map((spot: AdminSpot) => spot.state))].sort(), [data.spots]);
  const close = () => {
    setDialog(null);
    setEditing(null);
    setForm(blankSpot);
  };
  const openSpot = (spot?: AdminSpot) => {
    setEditing(spot || null);
    setForm(spot ? { ...blankSpot, ...spot, speciesIds: (spot.fishing_spot_species || [])
              .map((row) => row.species?.id)
              .filter(Boolean)}
        : blankSpot,
    );
    setDialog("spot");
  };
  const openSimple = (kind: "species" | "accommodation", item?: any) => {
    setEditing(item || null);
    setForm(item || (kind === "accommodation" ? blankAccommodation : {}));
    setDialog(kind);
  };
  const update = (key: string, value: unknown) => setForm((current: any) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    try {
      if (dialog === "spot") {
        if (!form.name?.trim() || !form.state?.trim()) throw new Error("Name and state are required.");
        const latitude = form.latitude === "" || form.latitude == null ? null : Number(form.latitude);
        const longitude = form.longitude === "" || form.longitude == null ? null : Number(form.longitude);
        if (latitude !== null && !Number.isFinite(latitude)) throw new Error("Latitude must be a valid number.");
        if (longitude !== null && !Number.isFinite(longitude)) throw new Error("Longitude must be a valid number.");
        const spotId = editing?.id ?? (await getNextFishingSpotId());
        const spot = await saveAdminRecord(
          "fishing_spots", {
            id: spotId,
            name: form.name.trim(),
            slug: editing?.slug || `${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
            description: form.description || null,
            city: form.city || null,
            state: form.state,
            county: form.county || null,
            country: form.country || "USA",
            address: form.address || null,
            latitude,
            longitude,
            water_type: form.water_type,
            public_access: !!form.public_access,
            private_access: !!form.private_access,
            permit_required: !!form.permit_required,
            permit_information: form.permit_information || null,
            best_seasons: form.best_seasons || null,
            fishing_notes: form.fishing_notes || null,
            image_url: form.image_url || null,
            website_url: form.website_url || null,
            status: form.status,
          },
          editing?.id,
        );
        if (spot?.id) await replaceSpotRelations( Number(spot.id), form.speciesIds || [], form.checklistIds || [] );
      } else if (dialog === "species") {
        if (!form.name?.trim()) { throw new Error("Species name is required.") }
        await saveAdminRecord(
          "fishing_species", {
            name: form.name.trim(),
            scientific_name: form.scientific_name || null,
            category: form.category || null,
            subcategory: form.subcategory || null,
            description: form.description || null,
            image_url: form.image_url || null,
            habitat: form.habitat || null,
            average_size: form.average_size || null,
            record_size: form.record_size || null,
            best_seasons: Array.isArray(form.best_seasons) ? form.best_seasons : [],
            peak_season: form.peak_season || null,
            recommended_bait: Array.isArray(form.recommended_bait) ? form.recommended_bait : [],
            recommended_lures: Array.isArray(form.recommended_lures) ? form.recommended_lures : [],
            techniques: Array.isArray(form.techniques) ? form.techniques : [],
            difficulty: form.difficulty || null,
            fun_fact: form.fun_fact || null,
            conservation: form.conservation || null,
            is_active: form.is_active !== false,
          },
          editing?.id,
        );
      } else if (dialog === "accommodation") {
        if (!form.name?.trim() || !form.spot_id) { throw new Error("Hotel name and fishing spot are required.")}
        await saveAdminRecord(
          "accommodations", {
            spot_id: Number(form.spot_id),
            name: form.name.trim(),
            type: form.type || "hotel",
            address: form.address || null,
            phone: form.phone || null,
            price_min: form.price_min === "" ? null : Number(form.price_min),
            price_max: form.price_max === "" ? null : Number(form.price_max),
            rating: form.rating === "" ? null : Number(form.rating),
            description: form.description || null,
            amenities: String(form.amenities || "").split(",").map((item) => item.trim()).filter(Boolean),
            website: form.website || null,
            distance_miles: form.distance_miles === "" ? null : Number(form.distance_miles),
          },
          editing?.id,
        );
      }
      toast({ title: "Saved successfully" });
      close();
      await load();
    } catch (error) {
      toast({ title: "Unable to save", description: message(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const remove = async (table: string, id: string | number, label: string) => {
    if (!window.confirm(`Delete this ${label}?`)) return;
    try {
      await deleteAdminRecord(table, id);
      toast({ title: `${label} deleted` });
      await load();
    } catch (error) {
      toast({
        title: "Unable to delete",
        description: message(error),
        variant: "destructive",
      });
    }
  };
  if (authorized === null || (loading && !data.spots.length && !data.stats.spots)) return <FullLoading />;
  if (!authorized) return null;
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };
  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <aside className="hidden lg:flex w-72 shrink-0 bg-slate-900 border-r border-blue-500/20 flex-col">
        <Brand />
        <AdminNav path={location.pathname} />
      </aside>
      <main className="flex-1 min-w-0">
        <header className="h-16 border-b border-blue-500/20 bg-slate-900/80 px-4 md:px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-white"
              onClick={() => document.getElementById("admin-mobile-nav") ?.classList.toggle("hidden")}
            >
              <Menu />
            </Button>
            <div>
              <p className="text-xs text-blue-300">Admin console</p>
              <h1 className="font-semibold text-lg">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="hidden sm:flex items-center gap-2 text-sm text-blue-200 hover:text-white"
            >
              <ExternalLink className="w-4 h-4" />
              View public app
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="text-blue-200 hover:text-white hover:bg-slate-600"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>
        <div
          id="admin-mobile-nav"
          className="hidden lg:hidden bg-slate-900 border-b border-blue-500/20 p-4"
        >
          <AdminNav path={location.pathname} />
        </div>
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
          {section === "dashboard" && (
            <Overview stats={data.stats} spots={data.spots} />
          )}
          {section === "spots" && (
            <Spots
              data={data}
              filters={filters}
              setFilters={setFilters}
              states={states}
              open={openSpot}
              remove={remove}
            />
          )}
          {section === "species" && (
            <SpeciesManagement data={data.species} open={(item?: AdminSpecies) => openSimple("species", item)} remove={remove} />
          )}
          {section === "accommodations" && (
            <AccommodationManagement
              data={data.accommodations}
              spots={data.spotOptions}
              open={(item?: AdminAccommodation) => openSimple("accommodation", item)}
              remove={remove}
            />
          )}
          {section === "users" && (
            <UsersManagement data={data.users} onRefresh={load} toast={toast} />
          )}

          {section === "memberships" && (
            <AdminMembership data={data.subscribers} onGrant={grantMembership} onCancel={cancelMembership} toast={toast} />
          )}
        </div>
      </main>
      <SpotDialog
        open={dialog === "spot"}
        form={form}
        update={update}
        species={data.species}
        saving={saving}
        editing={!!editing}
        onSave={save}
        onClose={close}
      />
      <SimpleDialog
        kind={dialog === "species" ? "species" : null}
        open={dialog === "species"}
        form={form}
        update={update}
        spots={data.spots}
        saving={saving}
        editing={!!editing}
        onSave={save}
        onClose={close}
        toast={toast}
      />
      <AccommodationDialog
        open={dialog === "accommodation"}
        form={form}
        update={update}
        spots={data.spots}
        saving={saving}
        editing={!!editing}
        onSave={save}
        onClose={close}
      />
    </div>
  );
};

function FullLoading() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-blue-200">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      Checking admin access...
    </div>
  );
}
function Brand() {
  return (
    <div className="p-6 border-b border-blue-500/20">
      <Link to="/" className="flex items-center gap-3">
        <img
          src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp"
          className="w-10 h-10"
          alt="FishingFinderUSA"
        />
        <div>
          <div className="font-bold">FishingFinderUSA</div>
          <div className="text-xs text-blue-300">Admin workspace</div>
        </div>
      </Link>
    </div>
  );
}
function AdminNav({ path }: { path: string }) {
  return (
    <nav className="p-4 space-y-1">
      {navigation.map(([label, href, Icon]) => (
        <Link
          key={href}
          to={href}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${path === href || (href !== "/admin" && path.startsWith(href)) ? "bg-blue-500 text-white" : "text-blue-200 hover:bg-slate-800 hover:text-white"}`}
        >
          <Icon className="w-4 h-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
function Overview({ stats, spots }: any) {
  const cards = [
    ["Fishing Spots", stats.spots, MapPin],
    ["Active Spots", stats.activeSpots, ShieldCheck],
    ["Species", stats.species, Fish],
  ];
  return (
    <div className="space-y-8">
      <div>
        <p className="text-blue-300 text-sm">Catalog control center</p>
        <h2 className="text-3xl font-bold mt-1">Dashboard overview</h2>
      </div>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(([label, value, Icon]: any) => (
          <Card key={label} className="bg-slate-900 border-blue-500/20">
            <CardContent className="p-5">
              <Icon className="w-5 h-5 text-blue-400 mb-4" />
              <div className="text-3xl font-bold">
                {Number(value).toLocaleString()}
              </div>
              <div className="text-sm text-blue-200 mt-1">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
function Spots({ data, filters, setFilters, states, open, remove }: any) {
  const totalPages = Math.max(1, Math.ceil(data.count / 10));
  const update = (key: string, value: string) =>
    setFilters((current: any) => ({ ...current, [key]: value, page: 1 }));
  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Fishing spots</h2>
          <p className="text-blue-300 text-sm mt-1">
            {data.count.toLocaleString()} database records
          </p>
        </div>
        <Button
          onClick={() => open()}
          className="bg-blue-500 hover:bg-blue-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add fishing spot
        </Button>
      </div>
      <Card className="bg-slate-900 border-blue-500/20">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
            <Input
              value={filters.search}
              onChange={(e) => update("search", e.target.value)}
              placeholder="Search name, city, or state"
              className="pl-9 bg-slate-800 border-slate-700"
            />
          </div>
          <Select
            value={filters.state}
            onValueChange={(v) => update("state", v)}
          >
            <SelectTrigger className="bg-slate-800 border-slate-700">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {states.map((state: string) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-1 gap-3">
            <Select
              value={filters.status}
              onValueChange={(v) => update("status", v)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-slate-900 border-blue-500/20 overflow-hidden">
        <Table>
          <TableHeader className="[&_tr:hover]:bg-transparent">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Species</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.spots.length ? (
              data.spots.map((spot: AdminSpot) => (
                <TableRow key={spot.id}>
                  <TableCell>{spot.name}</TableCell>
                  <TableCell>
                    {[spot.city, spot.state].filter(Boolean).join(", ")}
                  </TableCell>
                  <TableCell>{spot.public_access ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Badge>{spot.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {spot.fishing_spot_species?.length || 0}
                  </TableCell>
                  <TableCell>
                    {new Date(spot.updated_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Actions
                      edit={() => open(spot)}
                      remove={() =>
                        remove("fishing_spots", spot.id, "fishing spot")
                      }
                    />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <Empty label="No fishing spots found." />
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between p-4 border-t border-blue-500/20 text-sm text-blue-300">
          <span>
            Page {filters.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button className="bg-blue-700 hover:bg-blue-600" variant="outline" size="sm" disabled={filters.page <= 1} onClick={() => setFilters((current: any) => ({ ...current, page: current.page - 1 }))}>
              <ChevronLeft className="w-4 h-4 bold" color="white" />
            </Button>
            <Button className="bg-blue-700 hover:bg-blue-600" variant="outline" size="sm" disabled={filters.page >= totalPages} onClick={() => setFilters((current: any) => ({ ...current, page: current.page + 1 }))}>
              <ChevronRight className="w-4 h-4 bold" color="white" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
function Management({ title, description, add, onAdd, total, children }: any) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-blue-300 text-sm mt-1">{description}</p>
          {typeof total === "number" && (
            <p className="text-blue-300 text-sm mt-1">
              {total.toLocaleString()} records
            </p>
          )}
        </div>
        <Button onClick={onAdd} className="bg-blue-500 hover:bg-blue-600">
          <Plus className="w-4 h-4 mr-2" />
          {add}
        </Button>
      </div>
      <Card className="bg-slate-900 border-blue-500/20 overflow-hidden">
        <Table>
          {title === "Species" ?
          <TableHeader className="[&_tr:hover]:bg-transparent">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader> 
          : title === "Accommodations" ?<TableHeader className="[&_tr:hover]:bg-transparent">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Spot name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Rating</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow></TableHeader> : null }
          {children}
        </Table>
      </Card>
    </div>
  );
}
function Actions({ edit, remove }: any) {
  return (
    <div className="flex justify-start gap-1">
      <Button variant="ghost" size="icon" onClick={edit}>
        <Pencil className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-red-300"
        onClick={remove}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={7} className="text-center text-blue-300 py-12">
        {label}
      </TableCell>
    </TableRow>
  );
}

function AccommodationManagement({ data, spots, open, remove }: { data: AdminAccommodation[]; spots: AdminSpot[]; open: (item?: AdminAccommodation) => void; remove: (table: string, id: string | number, label: string) => void }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filtered = data.filter((item) => (typeFilter === "all" || item.type === typeFilter) && `${item.name} ${item.type} ${item.address || ""} ${item.fishing_spots?.name || ""}`.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search accommodations by name, address, or fishing spot"
            className="pl-9 bg-slate-800 border-slate-700"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="md:w-48 bg-slate-800 border-slate-700">
            <SelectValue placeholder="Accommodation type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {["hotel", "motel", "airbnb", "lodge", "cabin", "resort"].map(
              (type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>
      <Management
        title="Accommodations"
        description="Add and maintain hotels and nearby places to stay for each fishing spot."
        add="Add accommodation"
        onAdd={() => open()}
        total={filtered.length}
      >
        <TableBody>
          {visible.length ? (
            visible.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  {item.fishing_spots?.name ||
                    spots.find((spot) => spot.id === item.spot_id)?.name ||
                    "Unknown spot"}
                </TableCell>
                <TableCell>{item.type}</TableCell>
                <TableCell>
                  {item.price_min != null || item.price_max != null
                    ? `$${item.price_min ?? "?"} - $${item.price_max ?? "?"}`
                    : "Not set"}
                </TableCell>
                <TableCell>{item.rating ?? "Not set"}</TableCell>
                <TableCell>
                  <Actions
                    edit={() => open(item)}
                    remove={() =>
                      remove("accommodations", item.id, "accommodation")
                    }
                  />
                </TableCell>
              </TableRow>
            ))
          ) : (
            <Empty label="No accommodations found." />
          )}
        </TableBody>
      </Management>
      <Pager page={page} totalPages={totalPages} setPage={setPage} />
    </div>
  );
}

function SpeciesManagement({ data, open, remove }: { data: AdminSpecies[]; open: (item?: AdminSpecies) => void; remove: (table: string, id: string | number, label: string) => void }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filtered = data.filter((item) => (categoryFilter === "all" || (item as AdminSpecies & { category?: string }).category === categoryFilter) && (difficultyFilter === "all" || (item as AdminSpecies & { difficulty?: string }).difficulty === difficultyFilter) && `${item.name} ${item.scientific_name || ""}`.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search species"
            className="pl-9 bg-slate-800 border-slate-700"
          />
        </div>
        <Select
          value={categoryFilter}
          onValueChange={(value) => {
            setCategoryFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="bg-slate-800 border-slate-700">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {["freshwater", "saltwater", "anadromous"].map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={difficultyFilter}
          onValueChange={(value) => {
            setDifficultyFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="bg-slate-800 border-slate-700">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All difficulty</SelectItem>
            {["Beginner", "Intermediate", "Advanced", "Expert"].map(
              (difficulty) => (
                <SelectItem key={difficulty} value={difficulty}>
                  {difficulty}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>
      <Management
        title="Species"
        description="Maintain the public species catalog."
        add="Add species"
        onAdd={() => open()}
        total={filtered.length}
      >
        <TableBody>
          {visible.length ? (
            visible.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.scientific_name || "Not set"}</TableCell>
                <TableCell>{item.spot_count || 0}</TableCell>
                <TableCell>{item.category || "Not set"}</TableCell>
                <TableCell>
                  <Badge>{item.is_active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell>
                  <Actions
                    edit={() => open(item)}
                    remove={() => remove("fishing_species", item.id, "species")}
                  />
                </TableCell>
              </TableRow>
            ))
          ) : (
            <Empty label="No species found." />
          )}
        </TableBody>
      </Management>
      <Pager page={page} totalPages={totalPages} setPage={setPage} />
    </div>
  );
}

function Pager({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between text-sm text-blue-300">
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          className="bg-blue-700 hover:bg-blue-600"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft className="w-4 h-4 bold" color="white" />
        </Button>
        <Button
          className="bg-blue-700 hover:bg-blue-600"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight className="w-4 h-4 bold" color="white" />
        </Button>
      </div>
    </div>
  );
}

function UsersManagement({ data, onRefresh, toast }: { data: AdminUser[]; onRefresh: () => Promise<void>; toast: (options: any) => void }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loadingAdmin, setLoadingAdmin] = useState<string | number | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filtered = data.filter((user) => (roleFilter === "all" || (roleFilter === "admin" ? user.is_admin : !user.is_admin)) && `${user.email || ""} ${user.display_name || ""}`.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const updateAdmin = async (user: AdminUser) => {
    try {
      setLoadingAdmin(user.id);
      await setAdminStatus(user.id, !user.is_admin);
      toast({
        title: user.is_admin ? "Admin access removed" : "Admin access granted",
      });
      await onRefresh();
    } catch (error) {
      toast({
        title: "Unable to update admin access",
        description: message(error),
        variant: "destructive",
      });
    } finally {
      setLoadingAdmin(null);
    }
  };
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Users</h2>
        <p className="text-blue-300 text-sm mt-1">
          Manage administrator access for existing authenticated users.
        </p>
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by email or display name"
            className="pl-9 bg-slate-800 border-slate-700"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(value) => {
            setRoleFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="md:w-40 bg-slate-800 border-slate-700">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
            <SelectItem value="user">Users</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="bg-slate-900 border-blue-500/20 overflow-hidden">
        <Table>
          <TableHeader className="[&_tr:hover]:bg-transparent">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length ? (
              visible.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.display_name || "Unnamed user"}</TableCell>
                  <TableCell>{user.email || "No email"}</TableCell>
                  <TableCell>
                    <Badge>{user.is_admin ? "Admin" : "User"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={user.is_admin ? "destructive" : "default"}
                      onClick={() => updateAdmin(user)}
                      disabled={loadingAdmin === user.id}
                    >
                      {loadingAdmin === user.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {loadingAdmin === user.id
                        ? "Updating..."
                        : user.is_admin
                          ? "Remove admin"
                          : "Set as Admin"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <Empty label="No users found." />
            )}
          </TableBody>
        </Table>
      </Card>
      <Pager page={page} totalPages={totalPages} setPage={setPage} />
    </div>
  );
}

function AdminMembership({ data = [], onGrant, onCancel, toast }: {
  data?: MembershipCandidate[];
  onGrant: (userId: string, durationDays: number) => Promise<void>;
  onCancel: (subscriptionId: string) => Promise<void>;
  toast: (options: any) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<MembershipCandidate | null>(null);
  const [durationDays, setDurationDays] = useState("30");
  const [saving, setSaving] = useState(false);
  const [cancellingSubscriptionId, setCancellingSubscriptionId] = useState<string | null>(null);
  const pageSize = 10;
  const filtered = data.filter((user) => `${user.email || ""} ${user.display_name || ""}`.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const grant = async () => {
    const days = Number(durationDays);
    if (!Number.isSafeInteger(days) || days < 1) {
      toast({
        title: "Invalid duration",
        description: "Enter a whole number of days greater than zero.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedUser) return;
    setSaving(true);
    try {
      await onGrant(selectedUser.id, days);
      setSelectedUser(null);
    } catch (error) {
      toast({
        title: "Unable to grant free membership",
        description: message(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };
  const cancel = async (subscriptionId: string) => {
    setCancellingSubscriptionId(subscriptionId);
    try {
      await onCancel(subscriptionId);
    } catch (error) {
      toast({
        title: "Unable to cancel admin-granted membership",
        description: message(error),
        variant: "destructive",
      });
    } finally {
      setCancellingSubscriptionId(null);
    }
  };
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Users subscription</h2>
        <p className="text-blue-300 text-sm mt-1">
          View every user, grant free Pro access to eligible users, and cancel memberships granted by an admin.
        </p>
      </div>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search by email or display name"
          className="pl-9 bg-slate-800 border-slate-700"
        />
      </div>
      <Card className="bg-slate-900 border-blue-500/20 overflow-hidden">
        <Table>
          <TableHeader className="[&_tr:hover]:bg-transparent">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length ? (
              visible.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.display_name || "Unnamed user"}</TableCell>
                  <TableCell>{user.email || "No email"}</TableCell>
                  <TableCell>
                    {user.subscription && isSubscriptionEntitled(user.subscription) ? (
                      <Badge className="bg-green-700 text-white">{user.subscription.plan} ({user.subscription.status})</Badge>
                    ) : (
                      <Badge className="bg-red-400 text-white">Not subscribed</Badge>
                    )}
                  </TableCell>
                  <TableCell>{user.subscription?.provider || (user.subscription ? "unknown" : "—")}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        onClick={() => setSelectedUser(user)}
                        disabled={!!user.subscription && isSubscriptionEntitled(user.subscription)}
                        title={user.subscription && isSubscriptionEntitled(user.subscription)
                          ? "This user already has an active subscription."
                          : undefined}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                         Membership
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={
                          cancellingSubscriptionId !== null ||
                          user.subscription?.provider !== "admin" ||
                          !isSubscriptionEntitled(user.subscription)
                        }
                        className="px-2 py-1"
                        onClick={() => {
                          if (user.subscription?.provider === "admin") {
                            void cancel(user.subscription.id);
                          }
                        }}
                      >
                        {cancellingSubscriptionId === user.subscription?.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <X className="w-4 h-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <Empty label="No users found." />
            )}
          </TableBody>
        </Table>
      </Card>
      <Pager page={page} totalPages={totalPages} setPage={setPage} />
      <Dialog
        open={selectedUser !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setSelectedUser(null);
        }}
      >
        <DialogContent className="bg-slate-900 border-blue-500/20 text-white">
          <DialogHeader>
            <DialogTitle className='text-white'>Grant free membership</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-blue-200">
            {selectedUser?.email || selectedUser?.display_name || "This user"} will have Pro access for the number of days you specify.
          </p>
          <div className="space-y-2">
            <Label htmlFor="membership-duration" className='text-white'>Access duration (days)</Label>
            <Input
              id="membership-duration"
              type="number"
              min="1"
              step="1"
              value={durationDays}
              onChange={(event) => setDurationDays(event.target.value)}
              className="bg-slate-800 border-slate-700"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setSelectedUser(null)}
              disabled={saving}
              className="border-slate-600 text-gray-300 hover:bg-slate-700 bg-inherit"
            >
              Cancel
            </Button>
            <Button onClick={grant} disabled={saving || selectedUser === null}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {saving ? "Granting..." : "Grant access"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccommodationDialog({ open, onClose, form, update, spots, saving, editing, onSave }: any) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-blue-500/20 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">
            {editing ? "Edit accommodation" : "Add accommodation"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label className="text-white">Fishing spot *</Label>
            <Select
              value={String(form.spot_id || "")}
              onValueChange={(value) => update("spot_id", value)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 mt-1">
                <SelectValue placeholder="Select fishing spot" />
              </SelectTrigger>
              <SelectContent>
                {spots.map((spot: AdminSpot) => (
                  <SelectItem key={spot.id} value={String(spot.id)}>
                    {spot.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            label="Name"
            value={form.name}
            update={(value: string) => update("name", value)}
            required
          />
          <div>
            <Label className="text-white">Type</Label>
            <Select
              value={form.type || "hotel"}
              onValueChange={(value) => update("type", value)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["hotel", "motel", "airbnb", "lodge", "cabin", "resort"].map(
                  (type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <Field
            label="Address"
            value={form.address}
            update={(value: string) => update("address", value)}
          />
          <Field
            label="Phone"
            value={form.phone}
            update={(value: string) => update("phone", value)}
          />
          <Field
            label="Minimum price"
            value={form.price_min}
            update={(value: string) => update("price_min", value)}
            type="number"
          />
          <Field
            label="Maximum price"
            value={form.price_max}
            update={(value: string) => update("price_max", value)}
            type="number"
          />
          <Field
            label="Rating"
            value={form.rating}
            update={(value: string) => update("rating", value)}
            type="number"
          />
          <Field
            label="Distance in miles"
            value={form.distance_miles}
            update={(value: string) => update("distance_miles", value)}
            type="number"
          />
          <Field
            label="Website URL"
            value={form.website}
            update={(value: string) => update("website", value)}
            type="url"
          />
          <Field
            label="Amenities"
            value={form.amenities}
            update={(value: string) => update("amenities", value)}
          />
          <div className="md:col-span-2">
            <Label className="text-white">Description</Label>
            <Textarea
              value={form.description || ""}
              onChange={(event) => update("description", event.target.value)}
              className="bg-slate-800 border-slate-700 mt-1"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            className="border-slate-600 text-gray-300 hover:bg-slate-700 bg-inherit"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={saving}
            className="bg-blue-500 hover:bg-blue-600"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
            accommodation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, update, type = "text", required = false }: any) {
  return (
    <div>
      <Label className="text-white">
        {label}
        {required ? " *" : ""}
      </Label>
      <Input
        type={type}
        value={value ?? ""}
        onChange={(e) => update(e.target.value)}
        required={required}
        className="bg-slate-800 border-slate-700 mt-1"
      />
    </div>
  );
}
function SpotDialog({
  open,
  onClose,
  form,
  update,
  species,
  saving,
  editing,
  onSave,
}: any) {
  const toggle = (key: string, id: string, checked: boolean) =>
    update(
      key,
      checked
        ? [...(form[key] || []), id]
        : (form[key] || []).filter((value: string) => value !== id),
    );
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-blue-500/20 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <p className="text-2xl font-bold text-white">{editing ? "Edit fishing spot" : "Add fishing spot"}</p>
          </DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-4">
          <Field
            label="Name"
            value={form.name}
            update={(v: string) => update("name", v)}
            required
          />
          <Field
            label="Address"
            value={form.address}
            update={(v: string) => update("address", v)}
          />
          <Field
            label="City"
            value={form.city}
            update={(v: string) => update("city", v)}
          />
          <Field
            label="State"
            value={form.state}
            update={(v: string) => update("state", v)}
            required
          />
          <Field
            label="Latitude"
            value={form.latitude}
            update={(v: string) => update("latitude", v)}
            type="number"
          />
          <Field
            label="Longitude"
            value={form.longitude}
            update={(v: string) => update("longitude", v)}
            type="number"
          />
          <Field
            label="Best seasons"
            value={form.best_seasons}
            update={(v: string) => update("best_seasons", v)}
          />
          {/* <Field
            label="Website URL"
            value={form.website_url}
            update={(v: string) => update("website_url", v)}
            type="url"
          /> */}
          <div className="md:col-span-2">
            <Label className="text-white">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className="bg-slate-800 border-slate-700 mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-white">Fishing notes</Label>
            <Textarea
              value={form.fishing_notes}
              onChange={(e) => update("fishing_notes", e.target.value)}
              className="bg-slate-800 border-slate-700 mt-1"
            />
          </div>
          <div>
            <Label className="text-white">Water type</Label>
            <Select
              value={form.water_type}
              onValueChange={(v) => update("water_type", v)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["lake", "river", "ocean", "dam", "private", "pay-lake"].map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-white">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => update("status", v)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["active", "inactive"].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white">Access</Label>
            <label className="flex items-center gap-2 text-sm text-blue-200">
              <Checkbox
                checked={!!form.public_access}
                onCheckedChange={(value) => {
                  const checked = value === true;
                  update("public_access", checked);
                  if (checked) update("private_access", false);
                }}
              />
              Public access
            </label>
            <label className="flex items-center gap-2 text-sm text-blue-200">
              <Checkbox
                checked={!!form.private_access}
                onCheckedChange={(value) => {
                  const checked = value === true;
                  update("private_access", checked);
                  if (checked) update("public_access", false);
                }}
              />
              Private access
            </label>
            <label className="flex items-center gap-2 text-sm text-blue-200">
              <Checkbox
                checked={!!form.permit_required}
                onCheckedChange={(value) => update("permit_required", value === true)}
              />
              Permit required
            </label>
          </div>
          <div>
            <Label className="text-white">Information / cost</Label>
            <Textarea
              value={form.permit_information}
              onChange={(e) => update("permit_information", e.target.value)}
              placeholder="Free (License Required) or Fly-in Lodge ($300-800/week)"
              className="bg-slate-800 border-slate-700"
            />
          </div>
          <RelationList
            title="Species"
            items={species}
            selected={form.speciesIds}
            idKey="id"
            labelKey="name"
            onToggle={(id, checked) => toggle("speciesIds", id, checked)}
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-slate-600 text-gray-300 hover:bg-slate-700 bg-inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={saving}
            className="bg-blue-500 hover:bg-blue-600"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save spot
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function RelationList({
  title,
  items,
  selected,
  idKey,
  labelKey,
  onToggle,
}: any) {
  return (
    <div className="md:col-span-2">
      <Label className="text-white">{title}</Label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
        {items.map((item: any) => (
          <label
            key={item[idKey]}
            className="flex items-center gap-2 text-sm text-blue-200"
          >
            <Checkbox
              checked={(selected || []).includes(item[idKey])}
              onCheckedChange={(checked) =>
                onToggle(item[idKey], checked === true)
              }
            />
            {item[labelKey]}
          </label>
        ))}
      </div>
    </div>
  );
}

async function uploadSpeciesImageFile(file: File, speciesName?: string): Promise<string> {
  const safeName = (speciesName || "species")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "species";
  const ext = file.name.split(".").pop() || file.type.split("/")[1] || "jpg";
  const path = `species/${safeName}-${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage.from("species-images").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || "image/jpeg",
  });

  if (error) throw new Error(error.message);

  const { data: urlData } = supabase.storage.from("species-images").getPublicUrl(data.path);
  if (!urlData.publicUrl) throw new Error("Could not generate a public image URL.");

  return urlData.publicUrl;
}

function SimpleDialog({
  kind,
  open,
  onClose,
  form,
  update,
  spots,
  saving,
  editing,
  onSave,
  toast
}: any) {
  const isSpecies = kind === "species";
   const [uploadingImage, setUploadingImage] = useState(false);

  const handleSpeciesImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      if (toast) {
        toast({ title: "Upload failed", description: "Please choose a valid image file.", variant: "destructive" });
      }
      event.target.value = "";
      return;
    }

    try {
      setUploadingImage(true);
      const url = await uploadSpeciesImageFile(file, form?.name);
      update("image_url", url);
      if (toast) {
        toast({ title: "Image uploaded", description: "Species image saved to Supabase storage." });
      }
    } catch (error) {
      console.error("Species image upload failed:", error);
      if (toast) {
        toast({
          title: "Upload failed",
          description: error instanceof Error ? error.message : "Could not upload species image.",
          variant: "destructive",
        });
      }
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-blue-500/20 text-white max-w-lg overflow-y-auto max-h-[90vh] my-2">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">
            {editing ? "Edit" : "Add"} {kind}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field
            label="Name"
            value={form.name || ""}
            update={(v: string) => update("name", v)}
            required
          />
          {isSpecies && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Scientific Name"
                  value={form.scientific_name || ""}
                  update={(v: string) => update("scientific_name", v)}
                />
                <Field
                  label="Category"
                  value={form.category || ""}
                  update={(v: string) => update("category", v)}
                />
                <Field
                  label="Subcategory"
                  value={form.subcategory || ""}
                  update={(v: string) => update("subcategory", v)}
                /> 
                <Field
                  label="Difficulty"
                  value={form.difficulty || ""}
                  update={(v: string) => update("difficulty", v)}
                /> 
                <Field
                  label="Average Size"
                  value={form.average_size || ""}
                  update={(v: string) => update("average_size", v)}
                /> 
                <Field
                  label="Record Size"
                  value={form.record_size || ""}
                  update={(v: string) => update("record_size", v)}
                /> 
                <Field
                  label="Peak Season"
                  value={form.peak_season || ""}
                  update={(v: string) => update("peak_season", v)}
                /> 
                 <div className="md:col-span-2 space-y-2">
                  <Label className="text-white">Image URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.image_url || ""}
                      onChange={(e) => update("image_url", e.target.value)}
                      type="url"
                      placeholder="https://..."
                      className="bg-slate-800 border-slate-700 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-600 text-gray-200 hover:bg-slate-700 bg-inherit whitespace-nowrap"
                      onClick={() => document.getElementById("species-image-upload")?.click()}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : "Upload image"}
                    </Button>
                    <input
                      id="species-image-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleSpeciesImageUpload}
                    />
                  </div>

                  {form.image_url && (
                    <div className="mt-2 overflow-hidden rounded-md border border-slate-700 bg-slate-800">
                      <img src={form.image_url} alt={form.name || "Species image"} className="h-32 w-full object-cover" />
                    </div>
                  )}
                </div>
              </div> 
              <div>
                <Label className="text-white"> Description </Label> 
                <Textarea
                  value={form.description || ""}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Enter species description..."
                  className="bg-slate-800 border-slate-700 min-h-[100px]"
                /> 
              </div> 
              <div>
                <Label className="text-white"> Habitat </Label> 
                <Textarea
                  value={form.habitat || ""}
                  onChange={(e) => update("habitat", e.target.value)}
                  placeholder="Describe the habitat where this species is found..."
                  className="bg-slate-800 border-slate-700 min-h-[100px]"
                /> 
              </div> 
              <div>
                <Label className="text-white"> Best Seasons </Label> 
                <Input
                  value={
                    Array.isArray(form.best_seasons)
                      ? form.best_seasons.join(", ")
                      : form.best_seasons || ""
                  }
                  onChange={(e) =>
                    update(
                      "best_seasons",
                      e.target.value
                        .split(",")
                        .map((item: string) => item.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="Spring, Summer, Fall"
                  className="bg-slate-800 border-slate-700"
                /> 
                <p className="text-xs text-slate-400 mt-1">
                   
                  Enter values separated by commas. 
                </p> 
              </div>
              <div>
                <Label className="text-white"> Recommended Bait </Label> 
                <Input
                  value={
                    Array.isArray(form.recommended_bait)
                      ? form.recommended_bait.join(", ")
                      : form.recommended_bait || ""
                  }
                  onChange={(e) =>
                    update(
                      "recommended_bait",
                      e.target.value
                        .split(",")
                        .map((item: string) => item.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="Live shiners, Nightcrawlers, Crawfish"
                  className="bg-slate-800 border-slate-700"
                /> 
                <p className="text-xs text-slate-400 mt-1">
                   
                  Enter values separated by commas. 
                </p> 
              </div>
              <div>
                <Label className="text-white"> Recommended Lures </Label> 
                <Input
                  value={
                    Array.isArray(form.recommended_lures)
                      ? form.recommended_lures.join(", ")
                      : form.recommended_lures || ""
                  }
                  onChange={(e) =>
                    update(
                      "recommended_lures",
                      e.target.value
                        .split(",")
                        .map((item: string) => item.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="Plastic worms, Crankbaits, Spinnerbaits"
                  className="bg-slate-800 border-slate-700"
                /> 
                <p className="text-xs text-slate-400 mt-1">
                  Enter values separated by commas. 
                </p> 
              </div>
              <div>
                <Label className="text-white"> Fishing Techniques </Label> 
                <Input
                  value={
                    Array.isArray(form.techniques)
                      ? form.techniques.join(", ")
                      : form.techniques || ""
                  }
                  onChange={(e) =>
                    update(
                      "techniques",
                      e.target.value
                        .split(",")
                        .map((item: string) => item.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="Texas rig, Topwater fishing, Drop shot"
                  className="bg-slate-800 border-slate-700"
                /> 
                <p className="text-xs text-slate-400 mt-1">
                   
                  Enter values separated by commas. 
                </p> 
              </div>
              <div>
                 
                <Label className="text-white"> Fun Fact </Label> 
                <Textarea
                  value={form.fun_fact || ""}
                  onChange={(e) => update("fun_fact", e.target.value)}
                  placeholder="Enter an interesting fact..."
                  className="bg-slate-800 border-slate-700"
                /> 
              </div>
              <div>
                 
                <Label className="text-white"> Conservation </Label> 
                <Textarea
                  value={form.conservation || ""}
                  onChange={(e) => update("conservation", e.target.value)}
                  placeholder="Enter conservation information..."
                  className="bg-slate-800 border-slate-700"
                /> 
              </div> 
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-blue-200">
            <Switch
              checked={form.is_active !== false}
              onCheckedChange={(value) => update("is_active", value)}
            />
            Active
          </label>
        </div>
        <div className="flex justify-end gap-3">
          <Button 
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-slate-600 text-gray-300 hover:bg-slate-700 bg-inherit"
        >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={saving}
            className="bg-blue-500 hover:bg-blue-600"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ProOnlyRoute({ children }: { children: ReactNode }) {
  const { isProUser, checked } = useProAccess();

  if (!checked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-blue-200">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Checking Pro access...
      </div>
    );
  }

  return isProUser ? <>{children}</> : <Navigate to="/pricing?required=pro" replace />;
}
