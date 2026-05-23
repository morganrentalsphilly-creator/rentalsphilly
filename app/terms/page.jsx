// ============================================================================
// Terms of Service — public page at /terms
//
// Linked from the email footer + intake footer. Intentionally lean — this
// is a small one-person rental advisory, not a marketplace. The point is
// to set basic expectations and limit liability, not to manufacture
// enforceability for things we don't actually do.
// ============================================================================

import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service · Rentals Philly',
  description: 'Terms governing your use of Rentals Philly.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-5 py-12 sm:py-16">
        <div className="mb-8">
          <Link href="/" className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-900">
            ← Rentals Philly
          </Link>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <div className="text-sm text-slate-500 mb-10">Last updated: May 23, 2026</div>

        <div className="space-y-6 text-[15px] leading-relaxed text-slate-700">
          <p>
            These Terms govern your use of the Rentals Philly website, intake form, scheduling tools, and
            communications (collectively, the &quot;Service&quot;). By using the Service you agree to these
            Terms. If you don&apos;t agree, please don&apos;t use the Service.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Who we are</h2>
          <p>
            &quot;Rentals Philly&quot; is a trade name used by Morgan Page, an individual real estate
            professional licensed in the Commonwealth of Pennsylvania. Rentals Philly is not a corporation,
            LLC, or other separate legal entity — it is the brand under which Morgan Page operates as a sole
            proprietor. References to &quot;we,&quot; &quot;us,&quot; or &quot;Rentals Philly&quot;
            throughout these Terms mean Morgan Page in that capacity.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">What we do</h2>
          <p>
            Rentals Philly is a one-person rental advisory based in Philadelphia. We help you find an apartment
            by hand-picking listings that match your criteria, scheduling tours, and helping you submit
            applications to landlords. We are an independent advisor; we do not own, manage, or guarantee any
            property listed.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Accuracy of listings</h2>
          <p>
            Property details (price, availability, photos, amenities, floor plans) come from third parties —
            multiple listing services, landlord websites, and listing agents. We do our best to verify but
            we can&apos;t guarantee accuracy. Always confirm the specifics with the landlord before signing a
            lease. Availability can change between when we send you a listing and when you tour or apply.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Tours and scheduling</h2>
          <p>
            Tour times shown in the scheduler are based on our availability and the landlord&apos;s. We try
            hard to honor every booking but tours can be cancelled or rescheduled on short notice — by the
            landlord, by us, or by you. If a tour is cancelled we&apos;ll let you know by SMS and email and
            help you reschedule.
          </p>
          <p>
            By booking a tour, you agree to show up on time or cancel at least 2 hours in advance. Repeated
            no-shows may result in us pausing your search.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Applications and landlord submissions</h2>
          <p>
            We help you submit rental applications when you ask us to. The decision to approve or deny an
            application is solely the landlord&apos;s. We don&apos;t guarantee any application will be
            approved. Application fees, deposits, and rent are owed directly to the landlord per their terms.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Fair housing</h2>
          <p>
            Rentals Philly supports Equal Housing Opportunity. We do not discriminate based on race, color,
            religion, sex, national origin, familial status, disability, or any other protected class, and we
            won&apos;t help landlords do so either.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Your responsibilities</h2>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Give us accurate information on the intake form. We use it to pick listings — bad inputs lead to bad matches.</li>
            <li>Don&apos;t use the Service for unlawful purposes, harassment, or to scrape data.</li>
            <li>Don&apos;t submit information about anyone other than yourself without their permission.</li>
            <li>Keep your contact info up to date so we can reach you about your search.</li>
          </ul>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">No professional advice</h2>
          <p>
            Nothing on this Service constitutes legal, financial, or tax advice. Talk to a licensed
            professional for any decision that needs one.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Disclaimers</h2>
          <p>
            The Service is provided &quot;as is&quot; without warranty of any kind. We don&apos;t warrant that
            the Service will be uninterrupted, error-free, or fit for a particular purpose. Listings are not
            guaranteed available; pricing and terms are subject to change by the landlord.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Limitation of liability</h2>
          <p>
            To the maximum extent allowed by law, Rentals Philly and its operator will not be liable for any
            indirect, incidental, special, consequential, or punitive damages, or any loss of profits or
            revenue, arising from your use of the Service. Our total liability for any claim is limited to
            $100.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Changes</h2>
          <p>
            We may update these Terms occasionally. The updated version will be posted on this page with a new
            &quot;Last updated&quot; date. Continued use of the Service after a change means you accept the
            updated Terms.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Governing law</h2>
          <p>
            These Terms are governed by the laws of the Commonwealth of Pennsylvania. Any dispute will be
            resolved in the state or federal courts located in Philadelphia, PA.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 pt-4">Contact</h2>
          <p>
            Questions:{' '}
            <a href="mailto:morganrentalsphilly@gmail.com" className="text-slate-900 underline">
              morganrentalsphilly@gmail.com
            </a>
          </p>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200 text-xs text-slate-500">
          <Link href="/privacy" className="hover:text-slate-900 underline">Privacy</Link>
          &nbsp;·&nbsp;
          <Link href="/" className="hover:text-slate-900 underline">Home</Link>
        </div>
      </div>
    </div>
  );
}
