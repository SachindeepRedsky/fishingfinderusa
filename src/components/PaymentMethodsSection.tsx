import React, { useEffect, useState, useCallback } from 'react';
import {
  Elements,
  CardElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CreditCard,
  Loader2,
  Plus,
  Trash2,
  Star,
  CheckCircle2,
  AlertTriangle,
  Lock,
  X,
} from 'lucide-react';

// =============================================================================
// PaymentMethodsSection
// Renders the saved-cards UI for an authenticated, subscribed user.
//
//   - Lists the customer's cards (brand, last4, exp, default badge)
//   - "Add new card" -> Stripe Elements form backed by a SetupIntent created
//     by the `attach-payment-method` edge function
//   - "Set as default" -> calls `attach-payment-method` action='set-default'
//   - "Remove" -> calls `detach-payment-method`
//
// The user's FamousPay (Stripe) customer id is read from `profiles.stripe_customer_id`
// (saved by the `create-subscription` edge function on successful checkout).
// =============================================================================

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
  funding?: string;
  country?: string;
  billingName?: string | null;
  isDefault: boolean;
  created?: number;
}

interface Props {
  userId: string;
  userEmail?: string;
  /** Optional override; if not provided, we read from profiles.stripe_customer_id */
  customerId?: string | null;
}

const brandColors: Record<string, string> = {
  visa: 'bg-[#1a1f71]',
  mastercard: 'bg-gradient-to-r from-[#eb001b] to-[#f79e1b]',
  amex: 'bg-[#2e77bb]',
  discover: 'bg-[#ff6000]',
  diners: 'bg-slate-700',
  jcb: 'bg-emerald-700',
  unionpay: 'bg-red-700',
  unknown: 'bg-slate-600',
};

function brandLabel(brand: string): string {
  if (brand === 'mastercard') return 'MC';
  if (brand === 'amex') return 'AMEX';
  if (brand === 'discover') return 'DISC';
  if (brand === 'diners') return 'DC';
  return brand?.toUpperCase() || 'CARD';
}

const PaymentMethodsSection: React.FC<Props> = ({ userId, userEmail, customerId: customerIdProp }) => {
  const [customerId, setCustomerId] = useState<string | null>(customerIdProp ?? null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Resolve customer id from profile if not passed in
  // ---------------------------------------------------------------------------
  const resolveCustomerId = useCallback(async () => {
    if (customerIdProp) {
      setCustomerId(customerIdProp);
      return customerIdProp;
    }
    const { data, error: profErr } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .maybeSingle();
    if (profErr) throw new Error(profErr.message);
    const cid = (data as any)?.stripe_customer_id || null;
    setCustomerId(cid);
    return cid;
  }, [customerIdProp, userId]);

  // ---------------------------------------------------------------------------
  // Load payment methods
  // ---------------------------------------------------------------------------
  const loadMethods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cid = await resolveCustomerId();
      if (!cid) {
        setMethods([]);
        return;
      }
      const { data, error: fnErr } = await supabase.functions.invoke('list-payment-methods', {
        body: { customerId: cid },
      });
      if (fnErr) throw new Error(fnErr.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      setMethods(((data as any)?.paymentMethods as PaymentMethod[]) || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }, [resolveCustomerId]);

  useEffect(() => {
    loadMethods();
  }, [loadMethods]);

  // ---------------------------------------------------------------------------
  // Set default
  // ---------------------------------------------------------------------------
  const handleSetDefault = async (paymentMethodId: string) => {
    if (!customerId) return;
    setActioningId(paymentMethodId);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('attach-payment-method', {
        body: { action: 'set-default', customerId, paymentMethodId },
      });
      if (fnErr) throw new Error(fnErr.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      await loadMethods();
    } catch (e: any) {
      setError(e?.message || 'Failed to set default payment method');
    } finally {
      setActioningId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Detach (remove)
  // ---------------------------------------------------------------------------
  const handleRemove = async (paymentMethodId: string) => {
    setActioningId(paymentMethodId);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('detach-payment-method', {
        body: { paymentMethodId },
      });
      if (fnErr) throw new Error(fnErr.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      setConfirmDeleteId(null);
      await loadMethods();
    } catch (e: any) {
      setError(e?.message || 'Failed to remove payment method');
    } finally {
      setActioningId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!userId) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 mb-10">
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl md:bg-blue-500/20 md:border md:border-blue-500/30 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="text-white text-lg font-semibold">Payment Methods</h3>
              <p className="text-slate-400 text-sm">Cards saved with your account, used for renewals & one-off charges.</p>
            </div>
          </div>
          {!addingCard && customerId && (
            <Button
              onClick={() => setAddingCard(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add new card
            </Button>
          )}
        </div>

        {/* {error && (
          <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-200 break-words">{error}</p>
          </div>
        )} */}

        {/* No customer id yet (user has never subscribed) */}
        {!loading && !customerId && (
          <div className="rounded-lg border border-slate-600 bg-slate-900/50 p-6 text-center">
            <CreditCard className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-300 font-medium mb-1">No payment methods yet</p>
            <p className="text-slate-400 text-sm">
              Once you subscribe, your card will appear here and you'll be able to manage it.
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          </div>
        )}

        {/* List of cards */}
        {!loading && customerId && methods.length > 0 && (
          <ul className="space-y-3">
            {methods.map((pm) => (
              <li
                key={pm.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4 hover:border-slate-600 transition"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span
                    className={`${brandColors[pm.brand] || brandColors.unknown} text-white text-[10px] font-bold tracking-wider px-2.5 py-1 rounded shadow-sm`}
                    style={{ minWidth: 44, textAlign: 'center' }}
                  >
                    {brandLabel(pm.brand)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium">
                        •••• {pm.last4}
                      </span>
                      {pm.isDefault && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-2 py-0.5">
                          <Star className="w-3 h-3 fill-emerald-300" />
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {pm.expMonth && pm.expYear
                        ? `Expires ${String(pm.expMonth).padStart(2, '0')}/${String(pm.expYear).slice(-2)}`
                        : 'Saved card'}
                      {pm.billingName ? ` · ${pm.billingName}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {!pm.isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actioningId === pm.id}
                      onClick={() => handleSetDefault(pm.id)}
                      className="border-slate-600 text-slate-200 hover:bg-slate-700"
                    >
                      {actioningId === pm.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Star className="w-3.5 h-3.5 mr-1.5" />
                          Set default
                        </>
                      )}
                    </Button>
                  )}
                  {confirmDeleteId === pm.id ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDeleteId(null)}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={actioningId === pm.id}
                        onClick={() => handleRemove(pm.id)}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        {actioningId === pm.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Confirm'
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmDeleteId(pm.id)}
                      className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Empty state when subscribed but no cards (rare) */}
        {!loading && customerId && methods.length === 0 && !addingCard && (
          <div className="rounded-lg border border-slate-600 bg-slate-900/50 p-6 text-center">
            <p className="text-slate-300 mb-3 text-[14px]">You don't have any saved cards yet.</p>
            <Button onClick={() => setAddingCard(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Add your first card
            </Button>
          </div>
        )}

        {/* Add-card form */}
        {addingCard && customerId && (
          <AddCardForm
            customerId={customerId}
            userEmail={userEmail}
            onCancel={() => setAddingCard(false)}
            onSuccess={async () => {
              setAddingCard(false);
              await loadMethods();
            }}
          />
        )}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// AddCardForm — Stripe Elements + SetupIntent flow
// ---------------------------------------------------------------------------

interface AddCardFormProps {
  customerId: string;
  userEmail?: string;
  onCancel: () => void;
  onSuccess: () => void | Promise<void>;
}

const AddCardForm: React.FC<AddCardFormProps> = (props) => {
  return (
    <Elements stripe={stripePromise}>
      <AddCardInner {...props} />
    </Elements>
  );
};

const AddCardInner: React.FC<AddCardFormProps> = ({ customerId, userEmail, onCancel, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Create the SetupIntent the moment the form mounts so confirmation is fast.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('attach-payment-method', {
          body: { action: 'create-setup-intent', customerId },
        });
        if (cancelled) return;
        if (fnErr) throw new Error(fnErr.message);
        if ((data as any)?.error) throw new Error((data as any).error);
        setClientSecret((data as any)?.clientSecret || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not initialize add-card form');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) {
      setError('Payment system is still loading. Please wait a moment.');
      return;
    }
    const cardEl = elements.getElement(CardElement);
    if (!cardEl) {
      setError('Card field not ready.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: confirmErr, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardEl,
          billing_details: { name: name.trim() || undefined, email: userEmail },
        },
      });
      if (confirmErr) throw new Error(confirmErr.message || 'Card was rejected');
      if (setupIntent?.status === 'succeeded') {
        setSuccess(true);
        setTimeout(onSuccess, 700);
      } else {
        throw new Error('Card setup did not complete. Please try again.');
      }
    } catch (e: any) {
      setError(e?.message || 'Could not save card');
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
        <p className="text-emerald-200 font-medium">Card added!</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-5 rounded-xl border border-slate-600 bg-slate-900/60 p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-white font-semibold flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-400" />
          Add a new card
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-white p-1 rounded"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <Label htmlFor="new-card-name" className="text-slate-300 text-sm">
          Cardholder name
        </Label>
        <Input
          id="new-card-name"
          type="text"
          autoComplete="cc-name"
          placeholder="Name on card"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 bg-slate-950/60 border-slate-600 text-white placeholder:text-slate-500"
          disabled={submitting}
        />
      </div>

      <div>
        <Label className="text-slate-300 text-sm">Card details</Label>
        <div className="mt-1 rounded-md border border-slate-600 bg-slate-950/60 px-3 py-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30">
          <CardElement
            options={{
              hidePostalCode: false,
              style: {
                base: {
                  fontSize: '16px',
                  color: '#ffffff',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  '::placeholder': { color: '#94a3b8' },
                  iconColor: '#60a5fa',
                },
                invalid: { color: '#f87171', iconColor: '#f87171' },
              },
            }}
            onChange={(ev) => {
              if (ev.error) setError(ev.error.message);
              else setError(null);
            }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1">
          <Lock className="w-3 h-3" />
          Card data is sent directly to Stripe, never to our servers.
        </p>
      </div>

      {/* {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-200 break-words">{error}</p>
        </div>
      )} */}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-700 border rounded-md"
        >
          Cancel
        </button>
        <Button
          type="submit"
          disabled={!stripe || submitting || !clientSecret}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Save card
            </span>
          )}
        </Button>
      </div>
    </form>
  );
};

export default PaymentMethodsSection;
