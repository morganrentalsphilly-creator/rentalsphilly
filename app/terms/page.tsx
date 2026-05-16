// Terms of service. URL: /terms
//
// Lightweight terms of use for the Rentals Philly site. Combined with
// /privacy this satisfies the typical A2P 10DLC vetting checklist.

export const metadata = {
  title: 'Terms of Service · Rentals Philly',
  description: 'Terms governing your use of Rentals Philly.',
};

export default function TermsPage() {
  const updated = new Date('2026-05-15').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  return (
    <main className="max-w-3xl mx-auto px-6 md:px-8 py-12 text-slate-700 leading-relaxed">
      <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">Terms of Service</h1>
      <p className="text-sm text-slate-500 mb-8">Last updated: {updated}</p>

      <p className="mb-6">
        Welcome to Rentals Philly. By using this site you agree to these terms. If you
        don&apos;t agree, please don&apos;t use the site.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">What this service is</h2>
      <p className="mb-6">
        Rentals Philly is operated by Morgan Page, an independent real estate professional
        licensed in Pennsylvania. The site helps prospective tenants find rentals in the
        Philadelphia area and request property showings. Listings and availability are
        sourced from third-party feeds (including BrightMLS) and from agents and property
        managers. We make a reasonable effort to keep information current, but cannot
        guarantee accuracy of price, availability, or property features.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Eligibility</h2>
      <p className="mb-6">
        You must be at least 18 years old to submit an intake form, request a showing, or
        otherwise contact us. The information you provide must be accurate.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">SMS and email communications</h2>
      <p className="mb-6">
        By providing your phone number you agree to receive transactional and informational
        SMS from Rentals Philly. Reply STOP to opt out. Reply HELP for help. Message and
        data rates may apply. See our <a className="underline" href="/privacy">Privacy Policy</a> for
        more detail on our SMS program.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">No agency relationship until agreed</h2>
      <p className="mb-6">
        Submitting an intake form or attending a showing does not by itself create a
        broker-client relationship. Any formal representation will be documented in a
        separate written agreement.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Fair housing</h2>
      <p className="mb-6">
        We follow the federal Fair Housing Act and the Pennsylvania Human Relations Act.
        We do not discriminate on the basis of race, color, national origin, religion,
        sex, familial status, disability, age, ancestry, or use of a guide or support
        animal, nor on any other basis protected by law.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Acceptable use</h2>
      <p className="mb-6">
        Don&apos;t use the site to send spam, scrape listings for resale, impersonate someone
        else, or interfere with our infrastructure. We may suspend access for any of the
        above.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">No warranties</h2>
      <p className="mb-6">
        The site is provided &ldquo;as is.&rdquo; To the maximum extent permitted by law, we
        disclaim all warranties, express or implied, including merchantability, fitness for
        a particular purpose, and non-infringement.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Limitation of liability</h2>
      <p className="mb-6">
        To the maximum extent permitted by law, our liability arising out of or relating to
        the site is limited to $100. We are not liable for indirect, consequential,
        incidental, or punitive damages.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Changes</h2>
      <p className="mb-6">
        We may update these terms. Material changes will be posted here with a new
        &ldquo;Last updated&rdquo; date.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Contact</h2>
      <p className="mb-6">
        Email: <a className="text-slate-900 underline" href="mailto:morganrentalsphilly@gmail.com">morganrentalsphilly@gmail.com</a>
      </p>

      <p className="text-xs text-slate-400 mt-12">
        See also: <a className="underline" href="/privacy">Privacy Policy</a>.
      </p>
    </main>
  );
}
