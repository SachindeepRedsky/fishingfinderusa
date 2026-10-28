import React, { useEffect, useMemo, useState } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { supabase } from '@/lib/supabase';
import {
  PLANS,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_ACCOUNT_ID,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
} from '@/lib/stripe';

import { Button } from '@/components/ui/button';
import { Loader2, Lock, Shield } from 'lucide-react';

// =============================================================================
// InlineCardCheckout — SetupIntent + Stripe Elements (card-only)
// -----------------------------------------------------------------------------
// Why this version works (fixes the "client_secret does not match any
// associated SetupIntent on this account" loaderror):
//
// The edge function `create-subscription` now talks DIRECTLY to the Stripe
// REST API using STRIPE_SECRET_KEY (the same key used by
// create-checkout-session). That means the SetupIntent is created on the
// same Stripe account as the publishable key bundled into the browser
// (VITE_STRIPE_PUBLISHABLE_KEY in .env).
//
// To keep both sides on the same account we MUST:
//   - use the publishable key from src/lib/stripe.ts (already env-driven)
//   - NOT pass `stripeAccount` to loadStripe unless we're in a Connect
//     scenario where the secret key belongs to a platform and the
//     SetupIntent was created with `Stripe-Account` header. We aren't.
//
// Flow:
//   1. POST { action: 'create-setup-intent' } → returns clientSecret + customerId
//   2. <Elements> + <PaymentElement> collect a card and confirmSetup() runs
//      against this account's SetupIntent → returns setupIntent.payment_method
//   3. POST { action: 'activate-subscription', paymentMethodId } → creates the
//      subscription. If the first invoice needs 3DS, we get a clientSecret
//      back and finish with stripe.confirmCardPayment().
// =============================================================================

// Use the publishable key from src/lib/stripe.ts — it reads
// VITE_STRIPE_PUBLISHABLE_KEY from .env and falls back to a safe empty string.
// Only pass stripeAccount when the env explicitly sets one AND the secret key
// is a platform key. For typical single-account setups we omit it.
const USE_CONNECT_ACCOUNT =
  ((import.meta as any).env?.VITE_STRIPE_USE_CONNECT ?? '').toString() === 'true';

const stripePromise: Promise<Stripe | null> = STRIPE_PUBLISHABLE_KEY
  ? loadStripe(
      STRIPE_PUBLISHABLE_KEY,
      USE_CONNECT_ACCOUNT && STRIPE_ACCOUNT_ID
        ? { stripeAccount: STRIPE_ACCOUNT_ID }
        : undefined
    )
  : Promise.resolve(null);


type Plan = 'monthly' | 'yearly';

interface Props {
  plan: Plan;
  user: { id: string; email: string };
  onSuccess: (subscriptionId?: string) => void;
}

// ---------------------------------------------------------------------------
// Inner form (rendered inside <Elements>)
// ---------------------------------------------------------------------------
const PaymentForm: React.FC<{
  plan: Plan;
  user: { id: string; email: string };
  customerId: string;
  onSuccess: (subscriptionId?: string) => void;
}> = ({ plan, user, customerId, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const planDetails = PLANS[plan];

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!stripe || !elements) {
      setError('Payment system is still loading. Please wait a moment.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1) Confirm the SetupIntent (collects + tokenizes card via Stripe.js
      //    using the gateway's account, so the payment_method is valid there).
      const { error: setupError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.origin + '/checkout/success',
          payment_method_data: {
            billing_details: {
              email: user.email,
              // Address fields are hidden in the PaymentElement (fields.billingDetails.address = 'never').
              // Stripe still requires these values to be supplied at confirm time, so we pass
              // a minimal address here. `country` is the only field Stripe strictly requires;
              // the rest are sent as null to satisfy the typings without collecting data.
              address: {
                country: 'US',
                line1: null,
                line2: null,
                city: null,
                state: null,
                postal_code: null,
              },
            },
          },
        },
        redirect: 'if_required',
      });


      if (setupError) {
        setError(setupError.message || 'Could not save card.');
        setSubmitting(false);
        return;
      }

      if (!setupIntent || setupIntent.status !== 'succeeded') {
        setError(
          setupIntent
            ? `Card setup status: ${setupIntent.status}`
            : 'Card setup did not complete.'
        );
        setSubmitting(false);
        return;
      }

      const paymentMethodId =
        typeof setupIntent.payment_method === 'string'
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id;

      if (!paymentMethodId) {
        setError('Stripe did not return a payment method id.');
        setSubmitting(false);
        return;
      }

      // 2) Activate the subscription server-side.
      //    Pass priceId explicitly from the frontend .env so the server
      //    doesn't have to mirror it in Edge Function secrets.
      const priceId =
        plan === 'yearly' ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;

      const { data, error: invokeError } = await supabase.functions.invoke(
        'create-subscription',
        {
          body: {
            action: 'activate-subscription',
            plan,
            email: user.email,
            userId: user.id,
            customerId,
            paymentMethodId,
            priceId,
          },
        }
      );


      if (invokeError) {
        setError(invokeError.message || 'Subscription request failed.');
        setSubmitting(false);
        return;
      }
      if (!data || data.error) {
        setError(data?.error || 'Subscription could not be created.');
        setSubmitting(false);
        return;
      }

      // 3) Handle 3-D Secure on the first invoice, if needed.
      if (data.requiresAction && data.clientSecret) {
        const { error: confirmErr, paymentIntent } =
          await stripe.confirmCardPayment(data.clientSecret);
        if (confirmErr) {
          setError(confirmErr.message || 'Authentication failed.');
          setSubmitting(false);
          return;
        }
        if (paymentIntent && paymentIntent.status !== 'succeeded') {
          setError(`Payment status: ${paymentIntent.status}`);
          setSubmitting(false);
          return;
        }
      } else if (
        data.status === 'incomplete' ||
        data.status === 'incomplete_expired' ||
        data.status === 'past_due'
      ) {
        // Defensive: the server failed to collect the first invoice but
        // didn't surface a client_secret we can use to retry. Surface a
        // clear error instead of silently treating it as success.
        setError(
          'Your card was saved but the first payment did not complete. ' +
            'Please try a different card or contact support.'
        );
        setSubmitting(false);
        return;
      }

      onSuccess(data.subscriptionId);

    } catch (err: any) {
      setError(err?.message || 'Unexpected error during checkout.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Lock className="h-3.5 w-3.5" />
        <span>
          Secure payment — your card is tokenized by Stripe and never touches our
          server.
        </span>
      </div>

      <div className="rounded-md bg-white/5 p-3 border border-slate-700">
        <PaymentElement
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card'],
            fields: {
              billingDetails: {
                address: 'never',
              },
            },
            wallets: {
              applePay: 'never',
              googlePay: 'never',
            },
          }}
        />
      </div>


      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="w-full bg-blue-600 hover:bg-blue-700"
        size="lg"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Shield className="h-4 w-4 mr-2" />
            Pay {planDetails.price}
          </>
        )}
      </Button>

      <p className="text-[11px] text-slate-500 text-center">
        By subscribing you agree to be charged {planDetails.price} per{' '}
        {planDetails.interval}. You can cancel anytime from your billing portal.
      </p>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Outer component — bootstraps the SetupIntent + <Elements>
// ---------------------------------------------------------------------------
const InlineCardCheckout: React.FC<Props> = ({ plan, user, onSuccess }) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const createSetupIntent = async (retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke(
          'create-subscription',
          {
            body: {
              action: 'create-setup-intent',
              plan,
              email: user.email,
              userId: user.id,
            },
          }
        );

        if (!error && data && !data.error) {
          return data;
        }

        console.warn(`Attempt ${attempt} failed`, error || data?.error);

        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        throw new Error(data?.error || error?.message || 'Failed to start checkout');
      } catch (err) {
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        throw err;
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setBootError(null);
    setClientSecret(null);
    setCustomerId(null);

    (async () => {
      try {
        const data = await createSetupIntent(3);
        
        if (!data.clientSecret || !data.customerId) {
          setBootError('Server did not return a SetupIntent.');
          return;
        }
        setClientSecret(data.clientSecret);
        setCustomerId(data.customerId);
      } catch (err: any) {
        if (!cancelled) {
          setBootError(err?.message || 'Failed to start checkout.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [plan, user.email, user.id]);

  const elementsOptions = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            appearance: {
              theme: 'night' as const,
              variables: {
                colorPrimary: '#3b82f6',
                colorBackground: '#0f172a',
                colorText: '#e2e8f0',
              },
            },
          }
        : undefined,
    [clientSecret]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing secure checkout...
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
        {bootError}
      </div>
    );
  }

  if (!clientSecret || !customerId || !elementsOptions) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
        Checkout is not ready yet. Please try again.
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <PaymentForm
        plan={plan}
        user={user}
        customerId={customerId}
        onSuccess={onSuccess}
      />
    </Elements>
  );
};

export default InlineCardCheckout;
