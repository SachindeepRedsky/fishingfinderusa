import React from 'react';
import { CreditCard, Zap } from 'lucide-react';

/**
 * Static preview of the wallet/express-checkout buttons that Stripe will
 * surface on the hosted checkout page. We don't actually mount real Apple Pay
 * or Google Pay buttons here (those require domain verification + the live
 * Stripe SDK to detect device support); instead we show recognisable brand
 * pills so the user knows they can complete checkout WITHOUT typing card
 * details once they click "Continue to Secure Checkout".
 */
const WalletButtonsPreview: React.FC = () => {
  return (
    <div className="bg-slate-900/40 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-amber-400" />
        <h4 className="text-sm font-semibold text-white">Express checkout available</h4>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-500">
          on next page
        </span>
      </div>

      <p className="text-xs text-gray-400 mb-3 leading-relaxed">
        Skip typing your card. Stripe will offer one-tap payment using whichever
        wallet your device supports:
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Apple Pay */}
        <div className="flex items-center justify-center gap-1.5 bg-black border border-slate-600 rounded-lg py-2.5 px-3 hover:border-slate-400 transition">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor" aria-hidden="true">
            <path d="M17.05 12.04c-.03-3.02 2.47-4.47 2.58-4.54-1.41-2.06-3.6-2.34-4.38-2.37-1.86-.19-3.64 1.1-4.59 1.1-.96 0-2.41-1.07-3.97-1.04-2.04.03-3.93 1.19-4.98 3.02-2.13 3.69-.54 9.15 1.52 12.16 1.01 1.47 2.21 3.13 3.78 3.07 1.52-.06 2.09-.98 3.93-.98 1.83 0 2.35.98 3.96.95 1.64-.03 2.67-1.5 3.67-2.98 1.16-1.71 1.63-3.37 1.66-3.46-.04-.02-3.18-1.22-3.21-4.83zM14.04 3.7c.84-1.02 1.41-2.43 1.25-3.84-1.21.05-2.67.81-3.54 1.83-.78.9-1.46 2.34-1.28 3.72 1.35.1 2.73-.69 3.57-1.71z" />
          </svg>
          <span className="text-white text-xs font-semibold">Pay</span>
        </div>

        {/* Google Pay */}
        <div className="flex items-center justify-center gap-1.5 bg-white border border-slate-300 rounded-lg py-2.5 px-3 hover:border-slate-500 transition">
          <svg viewBox="0 0 48 48" className="w-4 h-4" aria-hidden="true">
            <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
            <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
            <path fill="#FBBC04" d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/>
            <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
          </svg>
          <span className="text-slate-800 text-xs font-semibold">Pay</span>
        </div>

        {/* Link by Stripe */}
        <div className="flex items-center justify-center gap-1.5 bg-[#00D66F] border border-emerald-400 rounded-lg py-2.5 px-3 hover:brightness-110 transition">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-black" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2V9h2v8zm5 0h-2V9h2v8z" />
          </svg>
          <span className="text-black text-xs font-bold">Link</span>
        </div>

        {/* Card */}
        <div className="flex items-center justify-center gap-1.5 bg-slate-800 border border-slate-600 rounded-lg py-2.5 px-3 hover:border-slate-400 transition">
          <CreditCard className="w-4 h-4 text-blue-300" />
          <span className="text-white text-xs font-semibold">Card</span>
        </div>
      </div>

      <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
        Apple Pay appears on Safari (iOS / macOS), Google Pay on Chrome
        (Android / desktop). Link auto-fills saved cards across Stripe
        merchants. Availability depends on your device.
      </p>
    </div>
  );
};

export default WalletButtonsPreview;
