import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Scale, Fish } from 'lucide-react';

const TermsOfService: React.FC = () => {
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
          <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-2">
            <Scale className="w-6 h-6 text-amber-300" />
          </div>
          <h1 className="text-4xl font-bold text-white">Terms of Service</h1>
        </div>
        <p className="text-blue-300 mb-8">Last updated: {lastUpdated}</p>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 space-y-6 text-blue-100 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              These Terms of Service ("Terms") form a binding legal agreement between you and FishingFinderUSA ("we,"
              "us," or "our") governing your access to and use of the FishingFinderUSA website, applications, and
              related services (collectively, the "Service"). By creating an account, subscribing, or otherwise using
              the Service, you agree to be bound by these Terms and our Privacy Policy. If you do not agree, do not
              use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">2. Eligibility</h2>
            <p>
              You must be at least 13 years old (or 16 in the EU/UK) to use the Service, and at least 18 years old to
              purchase a Pro subscription. By using the Service, you represent that you meet these requirements and
              that you can form a binding contract under applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">3. Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all activity
              under your account. Notify us immediately of any unauthorized use. We may suspend or terminate accounts
              that violate these Terms or that we reasonably believe are being used fraudulently.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">4. Free and Pro Plans</h2>
            <p>
              The Service is offered with a free Guest preview (limited to a fixed number of fishing spots) and one or
              more paid Pro plans that unlock the full catalog of spots, catch logging, trip planning, weather data,
              and other premium features. Features included in each plan may change from time to time; material
              changes will be communicated in advance where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">5. Subscriptions, Billing & Auto-Renewal</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Pro subscriptions are billed in advance on a recurring basis (monthly or annually) using the payment
                method on file. Billing is processed by Stripe.
              </li>
              <li>
                Your subscription will automatically renew at the end of each billing period at the then-current price
                unless you cancel at least 24 hours before the renewal date.
              </li>
              <li>
                You can cancel anytime from your account billing portal. Cancellation takes effect at the end of the
                current billing period — you retain Pro access until that date.
              </li>
              <li>
                We may change prices for future billing periods. Price changes apply only after we provide advance
                notice (at least 30 days). Continued use after the change constitutes acceptance.
              </li>
              <li>
                A 2% platform fee is included in the published price and is not added on top of it.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">6. Taxes</h2>
            <p>
              Prices displayed on the Service are exclusive of taxes unless stated otherwise. Where required by
              applicable law, sales tax, VAT, GST, or similar consumption taxes are calculated based on your billing
              address and collected at checkout via Stripe Tax. Tax amounts will be shown as a separate line item on
              your receipt. You are responsible for any other taxes, duties, or governmental fees that may apply to
              your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">7. Refunds</h2>
            <p>
              Except where required by applicable consumer-protection law (for example, the 14-day right of withdrawal
              in the EU/UK for digital services not yet fully performed), all subscription fees are non-refundable.
              We may, at our sole discretion, offer prorated refunds in cases of extended service outages or billing
              errors.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">8. User Content</h2>
            <p>
              You may submit content to the Service, including catch log entries, photos, trip notes, and reviews
              ("User Content"). You retain ownership of your User Content. You grant FishingFinderUSA a worldwide,
              non-exclusive, royalty-free license to host, store, reproduce, modify (for technical purposes such as
              resizing images), and display your User Content solely as needed to operate and improve the Service.
            </p>
            <p className="mt-2">
              You are solely responsible for your User Content and represent that you have all rights necessary to
              submit it. You may not submit content that is unlawful, infringing, defamatory, harassing, hateful,
              sexually explicit, or otherwise objectionable.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">9. Acceptable Use</h2>
            <p className="mb-2">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the Service to violate any law or regulation, including fishing regulations.</li>
              <li>Scrape, crawl, or harvest data from the Service except as expressly permitted.</li>
              <li>Attempt to reverse-engineer, decompile, or interfere with the Service.</li>
              <li>Resell or sublicense access to the Service without our written permission.</li>
              <li>Upload malware, scripts, or content that disrupts or harms the Service or other users.</li>
              <li>Impersonate another person or misrepresent your affiliation with anyone.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">10. Fishing Information & Regulations Disclaimer</h2>
            <p>
              Information about fishing spots, fish species, seasons, weather conditions, and licenses is provided for
              informational purposes only and may be inaccurate, incomplete, or out of date. Fishing regulations,
              licensing requirements, daily limits, and protected-species rules vary by state, county, and waterbody
              and change frequently. <strong className="text-white">You are solely responsible for verifying and
              complying with all applicable fishing regulations</strong> in your jurisdiction before fishing.
              FishingFinderUSA is not liable for fines, citations, injuries, or other consequences arising from
              reliance on Service content.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">11. Safety Disclaimer</h2>
            <p>
              Fishing and outdoor recreation involve inherent risks, including drowning, weather hazards, and
              wildlife encounters. You assume all risk of using the Service to plan or conduct fishing activities.
              Always check current weather, wear appropriate safety equipment, and follow local advisories.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">12. Third-Party Services</h2>
            <p>
              The Service integrates with third-party services such as Stripe (payments), Supabase (hosting and
              authentication), Google Maps (directions), and various weather data providers. We are not responsible
              for the content, accuracy, or practices of third-party services, which are governed by their own terms
              and privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">13. Intellectual Property</h2>
            <p>
              The Service and all materials we provide — including the FishingFinderUSA name, logo, software, text,
              graphics, and curated spot data — are owned by FishingFinderUSA or our licensors and are protected by
              copyright, trademark, and other intellectual-property laws. We grant you a limited, revocable,
              non-exclusive, non-transferable license to use the Service for your personal, non-commercial use,
              subject to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">14. Termination</h2>
            <p>
              You may terminate your account at any time from your account settings. We may suspend or terminate your
              access to the Service at any time, with or without notice, for any breach of these Terms or for any
              other reason, including ceasing to offer the Service. Upon termination, your right to use the Service
              ends immediately. Sections that by their nature should survive (e.g., disclaimers, indemnity, limitation
              of liability, dispute resolution) will survive.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">15. Disclaimers</h2>
            <p className="uppercase text-sm tracking-wide">
              The Service is provided "as is" and "as available" without warranties of any kind, whether express,
              implied, or statutory, including warranties of merchantability, fitness for a particular purpose, title,
              non-infringement, or quiet enjoyment. We do not warrant that the Service will be uninterrupted, secure,
              or error-free.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">16. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, FishingFinderUSA and its officers, directors, employees, and
              agents will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive
              damages, or any loss of profits, revenues, data, or goodwill, arising out of or in connection with your
              use of the Service. Our aggregate liability for any claim arising out of or relating to these Terms or
              the Service will not exceed the greater of (a) the amount you paid us in the 12 months before the
              claim, or (b) USD $100.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">17. Indemnification</h2>
            <p>
              You agree to defend, indemnify, and hold harmless FishingFinderUSA and its affiliates from any claims,
              damages, liabilities, costs, and expenses (including reasonable attorneys' fees) arising from your use
              of the Service, your User Content, or your violation of these Terms or applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">18. Governing Law & Disputes</h2>
            <p>
              These Terms are governed by the laws of the State of Delaware, U.S.A., without regard to its conflict-of-laws
              rules. Any dispute will be resolved exclusively in the state or federal courts located in Delaware,
              except where mandatory consumer-protection laws of your jurisdiction provide otherwise. You and we
              waive any right to a jury trial.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">19. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. We will post the revised version with a new "Last updated"
              date and, for material changes, provide notice through the Service or by email. Continued use after the
              effective date constitutes acceptance of the revised Terms.
            </p>
          </section>
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            onClick={() => navigate('/privacy')}
            variant="outline"
            className="border-blue-400 text-blue-300 hover:bg-blue-500/20 bg-inherit"
          >
            Read our Privacy Policy
          </Button>
        </div>
      </main>
    </div>
  );
};

export default TermsOfService;
