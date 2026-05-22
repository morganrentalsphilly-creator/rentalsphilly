// ============================================================================
// Privacy Policy — public page at /privacy
//
// Linked from the email footer (lib/email-templates.js), the intake form
// footer, and the SMS A2P 10DLC registration. The exact language below is
// what carriers require for an approved 10DLC campaign — in particular
// the "no mobile information shared with third parties" clause (required
// by the CTIA messaging guidelines). Don't soften it without re-registering.
// ============================================================================

export const metadata = {
  title: 'Privacy Policy · Rentals Philly',
  description: 'How Rentals Philly handles your personal information.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-5 py-12 sm:py-16">
        <div className="mb-8">
          <a href="/" className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-900">
            ← Rentals Philly
          </a>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <div className="text-sm text-slate-500 mb-10">Last updated: May 22, 2026</div>

        <div className="space-y-6 text-[15px] leading-relaxed text-slate-700">
          <p>
            Rentals Philly (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) provides rental advisory and tour scheduling
            services to people looking for apartments in Philadelphia. This policy describes what information we
            collect, how we use it, and the choices you have.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Information we collect</h2>
          <p>
            When you submit our intake form, request a tour, or contact us, we collect the information you give
            us — typically your name, email address, phone number, target move-in date, budget, neighborhood
            preferences, bed/bath requirements, and notes about your search. If you complete a rental
            application through a third-party provider (e.g. RentSpree) you may also share employment, income,
            and identity verification details directly with that provider.
          </p>
          <p>
            We also collect basic technical information automatically when you visit our site (IP address,
            browser type, pages viewed) to keep the service running and to fight spam.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">How we use it</h2>
          <p>
            We use your information to respond to your inquiry, hand-pick rental listings that match your
            criteria, send you scheduling links, confirm tours, follow up after tours, and submit applications
            to landlords on your behalf when you ask us to. We may also send you occasional service-related
            updates by SMS and email.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">SMS messaging</h2>
          <p>
            By providing your mobile number, you consent to receive recurring automated text messages from
            Rentals Philly related to your rental search — including tour confirmations, scheduling reminders,
            curated listing links, and follow-ups — sent via an automatic dialing system. Consent is not a
            condition of any purchase. Message and data rates may apply. Message frequency varies. Reply HELP
            for help, STOP to cancel.
          </p>
          <p className="font-medium text-slate-900">
            No mobile information will be shared with third parties or affiliates for marketing or promotional
            purposes. All other categories of personal information may be shared with subprocessors solely to
            deliver the services you requested, as described below.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Who we share information with</h2>
          <p>We share your information only with service providers we use to operate Rentals Philly:</p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li><strong>Supabase</strong> — hosts our database and authentication.</li>
            <li><strong>Twilio</strong> — sends and receives SMS on our behalf.</li>
            <li><strong>Resend</strong> — sends transactional email on our behalf.</li>
            <li><strong>Anthropic</strong> — drafts personalized message suggestions from your conversation history. We do not send your information to Anthropic for training their models.</li>
            <li><strong>Vercel</strong> — hosts the application.</li>
            <li><strong>Landlords / listing agents</strong> — only when you explicitly ask us to submit an application or schedule a tour on your behalf.</li>
            <li><strong>RentSpree</strong> — only if you choose to complete a rental application through their platform.</li>
          </ul>
          <p>We do not sell your personal information. We do not share it with advertisers.</p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">How long we keep it</h2>
          <p>
            We retain lead and conversation history for as long as needed to provide the service and to keep
            records of past clients for referrals and follow-ups. You can ask us to delete your data at any
            time by emailing us at the address below.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Your choices</h2>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Reply <strong>STOP</strong> to any SMS we send to opt out of further text messages.</li>
            <li>Click the unsubscribe link in any email to opt out of marketing email. Transactional emails (tour confirmations, scheduling links) will continue while your search is active.</li>
            <li>Email us to request a copy of your data, correct inaccuracies, or delete your record.</li>
          </ul>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Fair housing</h2>
          <p>
            Rentals Philly supports Equal Housing Opportunity. We do not discriminate based on race, color,
            religion, sex, national origin, familial status, disability, or any other protected class.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Children</h2>
          <p>
            Rentals Philly is not directed to children under 13. We do not knowingly collect information from
            children.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Contact</h2>
          <p>
            Questions about this policy or a request to access or delete your data:{' '}
            <a href="mailto:morganrentalsphilly@gmail.com" className="text-slate-900 underline">
              morganrentalsphilly@gmail.com
            </a>
          </p>

          <p className="text-xs text-slate-500 pt-8 border-t border-slate-200">
            We may update this policy from time to time. We&apos;ll post the updated version on this page with
            a new &quot;Last updated&quot; date.
          </p>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200 text-xs text-slate-500">
          <a href="/terms" className="hover:text-slate-900 underline">Terms</a>
          &nbsp;·&nbsp;
          <a href="/" className="hover:text-slate-900 underline">Home</a>
        </div>
      </div>
    </div>
  );
}
