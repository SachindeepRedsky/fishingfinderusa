import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ManageBillingButtonProps {
  /** The Stripe customer id from the subscriptions table */
  customerId: string;
  /** Optional className override for layout */
  className?: string;
  /** Visual variant */
  variant?: 'default' | 'outline' | 'ghost';
  /** Optional return URL after the user finishes in the portal */
  returnUrl?: string;
  /** Optional label override */
  label?: string;
}

/**
 * Opens the Stripe Customer Portal in a new tab so users can update payment
 * methods, download invoices, switch plans, or cancel — without us building
 * any custom UI for it.
 */
const ManageBillingButton: React.FC<ManageBillingButtonProps> = ({
  customerId,
  className,
  variant = 'outline',
  returnUrl,
  label = 'Manage Billing',
}) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    if (!customerId) {
      toast({
        title: 'No billing account found',
        description: 'We could not find a Stripe customer linked to your subscription.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: {
          customerId,
          returnUrl: returnUrl || `${window.location.origin}/pricing`,
        },
      });

      if (error || !data?.url) {
        const message =
          (data as any)?.error ||
          error?.message ||
          'Could not open the billing portal. Please try again.';

        toast({
          title: 'Unable to open billing portal',
          description: message,
          variant: 'destructive',
        });
        return;
      }


      // Open the Stripe-hosted portal in a new tab — never embed in an iframe.
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({
        title: 'Unexpected error',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      variant={variant}
      className={className}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <CreditCard className="w-4 h-4 mr-2" />
      )}
      {loading ? 'Opening portal…' : label}
      {!loading && <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-70" />}
    </Button>
  );
};

export default ManageBillingButton;
