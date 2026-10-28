import * as React from "react"
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { expireUserSubscriptions, isSubscriptionEntitled } from '@/data/fishingSpots';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    };

    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}


export function useProAccess() {
  const [isProUser, setIsProUser] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkAccess = async (userId?: string) => {
      if (!userId) {
        if (mounted) {
          setIsProUser(false);
          setChecked(true);
        }
        return;
      }

      try {
        await expireUserSubscriptions(userId);
        const { data, error } = await supabase
          .from('subscriptions')
          .select('status, current_period_end')
          .eq('user_id', userId)
          .in('status', ['active', 'trialing']);
        if (error) throw error;
        if (mounted) setIsProUser((data || []).some(isSubscriptionEntitled));
      } catch (error) {
        console.error('Unable to verify Pro access:', error);
        if (mounted) setIsProUser(false);
      } finally {
        if (mounted) setChecked(true);
      }
    };

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('Unable to check the current session:', error.message);
        if (mounted) setChecked(true);
        return;
      }
      void checkAccess(data.session?.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setChecked(false);
      void checkAccess(session?.user.id);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { isProUser, checked };
}

