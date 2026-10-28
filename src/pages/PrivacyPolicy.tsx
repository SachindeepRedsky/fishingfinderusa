import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Fish } from 'lucide-react';

const PrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();
  const lastUpdated = 'May 19, 2026';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center md:justify-between">
          <button
            onClick={() => navigate('/')}
            className="text-blue-200 hover:text-white hover:bg-blue-500/20 md:hidden flex"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3"
          >
            <div className="p-2 rounded-lg">
              <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
            </div>
            <div className="text-left">
              <h1 className="text-xl font-bold text-white">FishingFinderUSA</h1>
              <p className="text-blue-300 text-xs">Find fishing spots in all 50 states</p>
            </div>
          </button>
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="text-blue-200 hover:text-white hover:bg-blue-500/20 md:flex hidden"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-2">
            <Shield className="w-6 h-6 text-blue-300" />
          </div>
          <h1 className="text-4xl font-bold text-white">Privacy Policy</h1>
        </div>
        <p className="text-blue-300 mb-8">Last updated: {lastUpdated}</p>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 space-y-6 text-blue-100 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">1. Introduction</h2>
            <p>
              FishingFinderUSA ("we," "us," or "our") respects your privacy and is committed to protecting your personal data.
              This Privacy Policy explains how we collect, use, store, and share information when you use our website,
              mobile experience, and related services (collectively, the "Service").
            </p>
            <p className="mt-2">
              By using the Service, you agree to the practices described in this Privacy Policy. If you do not agree, please
              do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">2. Information We Collect</h2>
            <p className="mb-2">We collect the following categories of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-white">Account information:</strong> email address, display name, and password
                (hashed) when you create an account.
              </li>
              <li>
                <strong className="text-white">Profile content:</strong> favorite fishing spots, saved trips, trip
                checklists, and catch log entries (including photos, species, weight, length, date, and location
                notes you choose to submit).
              </li>
              <li>
                <strong className="text-white">Payment information:</strong> when you subscribe to Pro, payment card
                data is collected and processed directly by our payment processor (Stripe). We do not store full card
                numbers on our servers — we only retain limited metadata such as the last 4 digits, card brand,
                customer ID, subscription ID, and billing status.
              </li>
              <li>
                <strong className="text-white">Location data:</strong> if you grant permission, we use your device's
                approximate location to display distance to fishing spots. Location is processed in your browser and
                is not stored on our servers unless you explicitly log a catch with a location.
              </li>
              <li>
                <strong className="text-white">Usage data:</strong> log data such as IP address, browser type, pages
                viewed, search queries on the Service, referring URLs, and timestamps.
              </li>
              <li>
                <strong className="text-white">Cookies and similar technologies:</strong> we use cookies and local
                storage to keep you signed in, remember your preferences, and analyze Service usage.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, maintain, and improve the Service.</li>
              <li>Authenticate users and protect account security.</li>
              <li>Process Pro subscription payments and prevent fraudulent transactions.</li>
              <li>Show personalized content such as your favorites, trips, and catch log.</li>
              <li>Display real-time weather and fishing-condition data relevant to selected spots.</li>
              <li>Send transactional emails (receipts, subscription notices, security alerts).</li>
              <li>With your consent, send occasional product updates and fishing tips.</li>
              <li>Comply with legal obligations and enforce our Terms of Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">4. Sharing of Information</h2>
            <p className="mb-2">We do not sell your personal information. We share information only as follows:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-white">Service providers:</strong> hosting (Supabase), payment processing
                (Stripe), email delivery, analytics, and weather APIs — each under contractual confidentiality.
              </li>
              <li>
                <strong className="text-white">Legal compliance:</strong> when required by law, subpoena, or to protect
                the rights, safety, or property of FishingFinderUSA, our users, or the public.
              </li>
              <li>
                <strong className="text-white">Business transfers:</strong> in connection with a merger, acquisition,
                or sale of assets, your information may be transferred subject to this Privacy Policy.
              </li>
              <li>
                <strong className="text-white">With your consent:</strong> for any other purpose disclosed at the time
                of collection.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">5. Payments and Tax</h2>
            <p>
              All Pro subscription payments are processed by Stripe under their{' '}
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 underline hover:text-blue-200"
              >
                privacy policy
              </a>
              . Where required by law, sales tax, VAT, GST, or similar consumption taxes may be calculated and
              collected at checkout using Stripe Tax based on your billing address. Tax amounts appear as a separate
              line item on your receipt.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">6. Data Retention</h2>
            <p>
              We retain account and content data for as long as your account is active. If you delete your account, we
              delete or anonymize your personal data within 30 days, except where retention is required for legal,
              tax, accounting, or fraud-prevention purposes (typically 7 years for payment records).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">7. Your Rights</h2>
            <p className="mb-2">
              Depending on your jurisdiction (including the EU/UK under GDPR and California under the CCPA/CPRA), you
              may have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access the personal data we hold about you.</li>
              <li>Correct inaccurate personal data.</li>
              <li>Delete your personal data ("right to be forgotten").</li>
              <li>Restrict or object to certain processing.</li>
              <li>Export your data in a portable format.</li>
              <li>Withdraw consent at any time.</li>
              <li>Lodge a complaint with a supervisory authority.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">8. Children's Privacy</h2>
            <p>
              The Service is not directed to children under 13 (or 16 in the EU/UK). We do not knowingly collect personal
              data from children. If you believe a child has provided us personal data, please contact us so we can
              delete it.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">9. Security</h2>
            <p>
              We implement industry-standard administrative, technical, and physical safeguards to protect your data,
              including TLS encryption in transit, encryption at rest for sensitive fields, and PCI-DSS-compliant
              payment handling via Stripe. No system is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">10. International Transfers</h2>
            <p>
              Our infrastructure is hosted in the United States. If you access the Service from outside the U.S., your
              information will be transferred to and processed in the U.S. We rely on appropriate safeguards (such as
              Standard Contractual Clauses) where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be posted on this page and,
              where required, notified by email. Continued use of the Service after changes become effective
              constitutes acceptance of the revised policy.
            </p>
          </section>
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            onClick={() => navigate('/terms')}
            variant="outline"
            className="border-blue-400 text-blue-300 hover:bg-blue-500/20 bg-inherit"
          >
            Read our Terms of Service
          </Button>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
