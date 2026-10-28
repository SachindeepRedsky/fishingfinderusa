import { loadStripe, Stripe } from '@stripe/stripe-js';

// ============================================================================
// STRIPE CONFIGURATION (env-driven)
// ============================================================================
// All Stripe values are now read from Vite environment variables so that
// secrets/keys never live in source control. Copy `.env.example` to `.env`
// (or `.env.local`) and fill in the values from your Stripe dashboard.
//
// Required variables:
//   VITE_STRIPE_PUBLISHABLE_KEY   - pk_test_... or pk_live_...
//   VITE_STRIPE_PRICE_MONTHLY     - price_... ID for the monthly plan
//   VITE_STRIPE_PRICE_YEARLY      - price_... ID for the yearly plan
//
// Optional:
//   VITE_STRIPE_ACCOUNT_ID        - acct_... (only if using Stripe Connect)
//
// IMPORTANT: The SECRET key (sk_test_... / sk_live_...) must be set in your
// Supabase Edge Function environment variables as STRIPE_SECRET_KEY.
// Never put secret keys in frontend code or in VITE_* variables — anything
// prefixed with VITE_ is bundled into the public client-side JS.
// ============================================================================

const env = import.meta.env;

const publishableKey: string = (env.VITE_STRIPE_PUBLISHABLE_KEY ?? '').trim();
const priceMonthly: string = (env.VITE_STRIPE_PRICE_MONTHLY ?? '').trim();
const priceYearly: string = (env.VITE_STRIPE_PRICE_YEARLY ?? '').trim();
const accountId: string = (env.VITE_STRIPE_ACCOUNT_ID ?? '').trim();

// Infer test vs. live mode from the publishable key prefix. This avoids
// having a separate MODE flag that can get out of sync with the actual key.
const inferredMode: 'test' | 'live' | 'unknown' = publishableKey.startsWith('pk_live_')
  ? 'live'
  : publishableKey.startsWith('pk_test_')
  ? 'test'
  : 'unknown';

// ----------------------------------------------------------------------------
// Pre-flight validation: detect missing / truncated / placeholder values
// BEFORE we hand them to Stripe.js. This prevents the cryptic "Invalid API
// Key provided" 401 from Stripe Elements and gives the developer a clear,
// actionable message.
// ----------------------------------------------------------------------------
function validateStripeConfig(): { valid: true } | { valid: false; reason: string } {
  if (!publishableKey) {
    return {
      valid: false,
      reason:
        'VITE_STRIPE_PUBLISHABLE_KEY is not set. Copy `.env.example` to `.env` and paste your Stripe publishable key from https://dashboard.stripe.com/test/apikeys',
    };
  }
  if (inferredMode === 'unknown') {
    return {
      valid: false,
      reason: `VITE_STRIPE_PUBLISHABLE_KEY must start with "pk_test_" or "pk_live_". Got: ${publishableKey.slice(0, 12)}...`,
    };
  }
  // Real Stripe publishable keys are ~107 chars. Anything under ~50 is
  // almost certainly truncated (e.g. accidentally pasting only the prefix).
  if (publishableKey.length < 50) {
    return {
      valid: false,
      reason: `VITE_STRIPE_PUBLISHABLE_KEY looks truncated (only ${publishableKey.length} characters — real keys are ~107). Copy the FULL key from https://dashboard.stripe.com/${inferredMode === 'test' ? 'test/' : ''}apikeys into your .env file.`,
    };
  }
  if (!priceMonthly || !priceMonthly.startsWith('price_')) {
    return {
      valid: false,
      reason: 'VITE_STRIPE_PRICE_MONTHLY is missing or invalid. Set it to a price_... ID from your Stripe dashboard in .env',
    };
  }
  if (!priceYearly || !priceYearly.startsWith('price_')) {
    return {
      valid: false,
      reason: 'VITE_STRIPE_PRICE_YEARLY is missing or invalid. Set it to a price_... ID from your Stripe dashboard in .env',
    };
  }
  if (priceMonthly.includes('REPLACE_WITH') || priceYearly.includes('REPLACE_WITH')) {
    return {
      valid: false,
      reason: 'Stripe price IDs are still placeholders. Replace them in your .env file with real price_... IDs from the Stripe dashboard.',
    };
  }
  return { valid: true };
}

const validation = validateStripeConfig();

export const STRIPE_TEST_MODE = inferredMode === 'test';
export const STRIPE_CONFIG_VALID = validation.valid;
export const STRIPE_CONFIG_ERROR = validation.valid ? null : validation.reason;
export const STRIPE_MODE: 'test' | 'live' | 'unknown' = inferredMode;
export const STRIPE_PUBLISHABLE_KEY = publishableKey;
export const STRIPE_PRICE_MONTHLY = priceMonthly;
export const STRIPE_PRICE_YEARLY = priceYearly;
export const STRIPE_ACCOUNT_ID = accountId;

// Only call loadStripe if config is valid — otherwise calling it with a bad
// key produces an unhelpful Elements `loaderror` event in the browser.
export const stripePromise: Promise<Stripe | null> = validation.valid
  ? loadStripe(publishableKey, accountId ? { stripeAccount: accountId } : undefined)
  : Promise.resolve(null);


if (!validation.valid) {
  // Use console.warn (not console.error) so preview error trackers don't
  // surface this as an unhandled error. This is a configuration notice,
  // not a runtime crash — the app still renders and works everywhere that
  // doesn't require Stripe. The checkout page shows an inline banner.
  // eslint-disable-next-line no-console
  console.warn(
    '[Stripe config] ' + validation.reason +
      '\n\nTHIS IS A CONFIG NOTICE, NOT A CRASH. The app will run normally; ' +
      'only the checkout page is disabled until you set the required env vars. ' +
      'See .env.example for the full list.'
  );
}

export const PLANS = {
  monthly: {
    id: 'monthly',
    name: 'Monthly',
    price: '$9.99',
    priceAmount: 9.99,
    interval: 'month',
    priceId: priceMonthly,
    features: [
      'Unlimited favorite spots',
      'Full catch log with photos',
      'Trip planner & sharing',
      'Weather forecasts for spots',
      'Lodging reviews & ratings',
      'Fish species encyclopedia',
      'Seasonal fishing tips',
      'Priority support',
    ],
  },
  yearly: {
    id: 'yearly',
    name: 'Yearly',
    price: '$79.99',
    priceAmount: 79.99,
    interval: 'year',
    priceId: priceYearly,
    savings: 'Save 33%',
    features: [
      'Everything in Monthly, plus:',
      'Unlimited favorite spots',
      'Full catch log with photos',
      'Trip planner & sharing',
      'Weather forecasts for spots',
      'Lodging reviews & ratings',
      'Fish species encyclopedia',
      'Seasonal fishing tips',
      'Priority support',
      '2 months free',
    ],
  },
} as const;
