import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { supabase } from '@/lib/supabase';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type IapPlan = 'monthly' | 'yearly';

export const IAP_PRODUCT_IDS: Record<IapPlan, string> = {
  monthly: (import.meta.env.VITE_APPLE_IAP_MONTHLY_PRODUCT_ID ?? 'com.fishingfinderusa.pro.monthly').trim(),
  yearly: (import.meta.env.VITE_APPLE_IAP_YEARLY_PRODUCT_ID ?? 'com.fishingfinderusa.pro.yearly').trim(),
};

/** Android package name used when verifying Google Play purchases server-side. */
export const ANDROID_PACKAGE_NAME = (
  import.meta.env.VITE_ANDROID_PACKAGE_NAME ?? 'com.fishingfinderusa'
).trim();

export interface AppleIapResponse {
  success: boolean;
  pending?: boolean;
  canceled?: boolean;
  status?: string;
  message?: string;
  errorMessage?: string | null;
  receipt?: string | null;
  transactionId?: string | null;
  productId?: string | null;
  /** Google Play purchase token (Android only) */
  purchaseToken?: string | null;
  /** Android package name reported by the native bridge (Android only) */
  packageName?: string | null;
  orderId?: string | null;
}

export interface AppleIapRestoreResponse {
  success: boolean;
  pending?: boolean;
  receipts?: Array<{ receipt: string; transactionId: string; productId?: string }>;
  errorMessage?: string;
}

export const getMedianBridge = (): any | null => {
  if (typeof window === 'undefined') return null;

  const win = window as any;
  const directBridge =
    win.median?.iap ??
    win.median?.googlePlay ??
    win.median ??
    win.gonative?.iap ??
    win.gonative ??
    null;
  if (directBridge) return directBridge;
  if (typeof win.JSBridge !== 'undefined') return win.JSBridge;
  return null;
};


const isIosDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
};

const isAndroidDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android/.test(navigator.userAgent) && !window.MSStream;
};

export const isIosMedianApp = (): boolean => {
  return isIosDevice() && !!getMedianBridge();
};

export const isAndroidMedianApp = (): boolean => {
  return isAndroidDevice() && !!getMedianBridge();
};


const normalizeIapResponse = (response: any): AppleIapResponse => {
  if (!response || typeof response !== 'object') {
    return { success: false, errorMessage: 'Invalid native IAP response' };
  }

  const status = String(response.status || response.state || '').toLowerCase();
  const pending = !!response.pending || status === 'pending';
  const canceled = !!response.canceled || status === 'canceled' || status === 'cancelled';

  const purchase = response.purchase || response.transaction || {};

  const success =
    response.success ?? (status === 'purchased' || status === 'restored' || pending);

  return {
    success,
    pending,
    canceled,
    status,
    errorMessage: response.errorMessage || response.message || response.error || null,
    receipt: response.receipt || response.receiptData || null,
    transactionId: response.transactionId || response.transaction_id || purchase.orderId || null,
    productId:
      response.productId ||
      response.productIdentifier ||
      response.product_id ||
      purchase.productId ||
      null,
    purchaseToken:
      response.purchaseToken ||
      response.purchase_token ||
      response.token ||
      purchase.purchaseToken ||
      purchase.token ||
      null,
    packageName:
      response.packageName || response.package_name || purchase.packageName || null,
    orderId: response.orderId || purchase.orderId || null,
  };
};


const wrapBridgeCall = async (action: string, payload: any): Promise<any> => {
  const bridge = getMedianBridge();
  console.log("bridge:::", bridge);
  if (!bridge) {
    throw new Error('Native Median bridge not available on this device.');
  }

  if (typeof bridge[action] === 'function') {
    return bridge[action](payload);
  }

  if (typeof bridge.postMessage === 'function') {
    return new Promise((resolve, reject) => {
      const requestId = `median-iap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const handler = (event: MessageEvent) => {
        const data = event.data;
        if (!data || data.requestId !== requestId) return;
        window.removeEventListener('message', handler);
        if (data.error) return reject(new Error(data.error));
        return resolve(data.payload);
      };
      window.addEventListener('message', handler);
      bridge.postMessage({ action, payload, requestId });
      setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Native IAP timed out.')); 
      }, 15000);
    });
  }

  throw new Error(`Native bridge does not expose requestPurchase or postMessage. ${JSON.stringify(bridge)} ${typeof bridge[action]} ${typeof bridge.postMessage}`);
};

export async function requestAppleIap(productId: string) {
  const iap = getMedianBridge();

  if (!iap) {
    throw new Error('Median IAP is unavailable.');
  }

  const purchaseMethod = iap.buy ?? iap.purchase;
  if (typeof purchaseMethod !== 'function') {
    throw new Error('Median IAP purchase method is unavailable.');
  }

  const result = await purchaseMethod({ productIdentifier: productId });
  return normalizeIapResponse(result);
}

export async function requestAndroidGooglePlayIap(productId: string) {
  if (!isAndroidMedianApp()) {
    throw new Error('Google Play subscription flow is only available in the Android app.');
  }

  const bridge = getMedianBridge();
  if (!bridge) {
    throw new Error('Median Android IAP bridge is unavailable.');
  }
  const win = window as any;
  const resolvePurchaseMethod = async (): Promise<((opts: any) => any) | null> => {
    const attempt = () => {
      const b = getMedianBridge();
      const w = window as any;
      return (
        b?.subscribe ?? b?.buy ?? b?.purchase ??
        w.median?.googlePlay?.subscribe ?? w.median?.googlePlay?.buy ?? w.median?.googlePlay?.purchase ??
        null
      );
    };

    let method = attempt();
    const maxMs = 4000;
    const interval = 200;
    let waited = 0;
    while (typeof method !== 'function' && waited < maxMs) {
      await new Promise((r) => setTimeout(r, interval));
      waited += interval;
      method = attempt();
    }

    return typeof method === 'function' ? method : null;
  };

  const purchaseMethod = await resolvePurchaseMethod();
  if (purchaseMethod == null) {
    console.error('Android purchase method missing; bridge state:', {
      median: (window as any).median,
      JSBridge: (window as any).JSBridge,
      isAndroidMedianApp: isAndroidMedianApp(),
    });
    throw new Error('Android native purchase method is unavailable.');
  }
   let userId: string | null = null;
    try {
      // supabase.auth.getSession() is async in newer SDKs
      // fallback to supabase.auth.session() if unavailable
      if (typeof (supabase.auth as any).getSession === 'function') {
        const sessionRes = await (supabase.auth as any).getSession();
        userId = sessionRes?.data?.session?.user?.id ?? null;
      } else if (typeof (supabase.auth as any).session === 'function') {
        const session = (supabase.auth as any).session();
        userId = session?.user?.id ?? null;
      }
    } catch (err) {
      console.warn('requestAndroidGooglePlayIap: failed to read supabase session', err);
      userId = null;
    }

    const result = await purchaseMethod({ productId, productIdentifier: productId, userId });
    return normalizeIapResponse(result);
  }

/** Reads any purchases Google Play already knows about for this device/account. */
export async function restoreAndroidGooglePlayIap(): Promise<AppleIapResponse[]> {
  const bridge = getMedianBridge();
  if (!bridge) return [];

  const win = window as any;
  const restoreMethod =
    bridge.restore ??
    bridge.restorePurchases ??
    bridge.getPurchases ??
    win.median?.googlePlay?.restore ??
    win.median?.googlePlay?.getPurchases;

  if (typeof restoreMethod !== 'function') return [];

  const response = await restoreMethod({});
  const list =
    (Array.isArray(response) && response) ||
    response?.purchases ||
    response?.receipts ||
    (response ? [response] : []);

  return (Array.isArray(list) ? list : []).map((item: any) => normalizeIapResponse(item));
}

/**
 * Sends a Google Play purchase token to the `verify-google-play` edge function,
 * which verifies it with the Android Publisher API and writes the result into
 * the `subscriptions` table (status/plan/current_period_end).
 */
export const verifyGooglePlayPurchase = async (params: {
  userId: string;
  productId: string;
  purchaseToken: string;
  packageName?: string;
}): Promise<{ success: boolean; active: boolean; message: string; plan?: string }> => {
  if (!params.userId) throw new Error('You must be signed in to activate your subscription.');

  const { data, error } = await supabase.functions.invoke('verify-google-play', {
    body: {
      action: 'verify-google-play',
      platform: 'google_play',
      userId: params.userId,
      productId: params.productId,
      purchaseToken: params.purchaseToken,
      packageName: params.packageName || ANDROID_PACKAGE_NAME,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to reach the Google Play verification service.');
  }
  if (!data || !data.success) {
    throw new Error(data?.message || 'Google Play verification failed on the backend.');
  }

  return {
    success: true,
    active: !!data.active,
    plan: data.plan,
    message: data.message || 'Google Play purchase verified.',
  };
};


export const restoreAppleIap = async () => {
  const iap = getMedianBridge();

  if (!iap) {
    return { success: false, errorMessage: 'Median IAP restore unavailable.' };
  }

  const restoreMethod = iap.restore ?? iap.restorePurchases;
  if (typeof restoreMethod !== 'function') {
    return { success: false, errorMessage: 'Median IAP restore method is unavailable.' };
  }

  const response = await restoreMethod({});

  return {
    success: !!response?.success || response?.status === 'restored',
    receipts: Array.isArray(response?.receipts)
      ? response.receipts.map((receipt: any) => ({
          receipt: receipt.receipt || receipt.receiptData,
          transactionId: receipt.transactionId || receipt.transaction_id,
          productId: receipt.productId || receipt.productIdentifier || receipt.product_id,
        }))
      : [],
    errorMessage: response?.errorMessage || response?.message || response?.error || null,
  };
};

export const verifyAppleReceipt = async (params: {
  userId: string;
  productId: string;
  receipt: string;
  transactionId?: string;
}): Promise<{ success: boolean; message: string }> => {
  const body = {
    action: 'verify-apple-receipt',
    platform: 'apple',
    userId: params.userId,
    productId: params.productId,
    receipt: params.receipt,
    transactionId: params.transactionId,
  };
  const { data, error } = await supabase.functions.invoke('verify-apple-receipt', { body });
  if (error) {
    throw new Error(error.message || 'Failed to send receipt verification request.');
  }
  if (!data || !data.success) {
    const message = data?.message || 'Receipt verification failed on the backend.';
    throw new Error(message);
  }

  return { success: true, message: data.message || 'Receipt verified successfully.' };
};

export const getNativeIapSupportDetails = () => {
  const bridge = getMedianBridge();
  return {
    isIosMedianApp: isIosMedianApp(),
    bridgeType: bridge ? bridge.constructor?.name || typeof bridge : 'unknown',
    monthlyProductId: IAP_PRODUCT_IDS.monthly,
    yearlyProductId: IAP_PRODUCT_IDS.yearly,
  };
};
