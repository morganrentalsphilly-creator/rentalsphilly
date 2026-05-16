// Privacy policy. URL: /privacy
//
// This page exists primarily to satisfy A2P 10DLC campaign vetting and
// TCPA-style consent disclosure for SMS. Keep the SMS section especially
// accurate to how the app actually behaves.

export const metadata = {
  title: 'Privacy Policy · Rentals Philly',
  description: 'How Rentals Philly collects, uses, and protects your information.',
};

export default function PrivacyPage() {
  const updated = new Date('2026-05-15').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  return (
    <main className="max-w-3xl mx-auto px-6 md:px-8 py-12 text-slate-700 leading-relaxed">
      <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">Privacy Policy</h1>
      <p className="text-sm text-slate-500 mb-8">Last updated: {updated}</p>

      <p className="mb-6">
        Rentals Philly (&ldquo;we,&rdquo; &ldquo;us&rdquo;) is operated by Morgan Page, an
        independent real estate professional based in Philadelphia, Pennsylvania. This
        policy explains what we collect when you use rentalsphilly.com, what we do with it,
        and your choices.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">What we collect</h2>
      <p className="mb-3">When you submit our intake form to request rental help, we collect:</p>
      <ul className="list-disc pl-6 mb-6 space-y-1">
        <li>Name, email address, and phone number</li>
        <li>Your rental criteria (budget, bedrooms, neighborhoods, move-in date, employment, credit-score range, pets, voucher status)</li>
        <li>Any messages you send us by SMS or email</li>
        <li>Showings you book and notes from those showings</li>
      </ul>
      <p className="mb-6">
        We also collect basic technical information automatically: IP address, device type,
        and pages visited. We do not use third-party advertising trackers.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">How we use it</h2>
      <ul className="list-disc pl-6 mb-6 space-y-1">
        <li>To match you to available rental listings.</li>
        <li>To schedule and confirm showings.</li>
        <li>To send you appointment reminders and respond to your questions.</li>
        <li>To send periodic updates about new listings that match your criteria, until you opt out.</li>
        <li>To improve our service.</li>
      </ul>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">SMS / text-message program</h2>
      <p className="mb-3">
        By submitting your phone number on our intake form or by replying to one of our
        messages, you agree to receive SMS text messages from Rentals Philly relating to
        rental listings, showing confirmations, and appointment reminders. Consent is not a
        condition of any service.
      </p>
      <ul className="list-disc pl-6 mb-3 space-y-1">
        <li><strong>Message frequency varies</strong> based on your activity. A typical lead receives 5–10 messages over the search-to-lease window.</li>
        <li><strong>Message and data rates may apply</strong> per your mobile carrier.</li>
        <li><strong>Reply STOP</strong> at any time to opt out. You will receive a confirmation message and we will not contact you by SMS again until you reply START.</li>
        <li><strong>Reply HELP</strong> to receive help or contact information.</li>
      </ul>
      <p className="mb-6">
        We do not share your phone number or SMS opt-in status with third parties for their
        own marketing. Carriers may apply their own privacy policies to messages traversing
        their networks.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Who we share with</h2>
      <p className="mb-6">
        We use a small set of service providers to operate the site: Supabase (database
        and authentication), Twilio (SMS delivery), Resend (email delivery), Vercel
        (hosting), and BrightMLS (listing data feed). Your information is only shared with
        these providers to the extent necessary for them to provide their service. We do
        not sell or rent your information.
      </p>
      <p className="mb-6">
        If you ultimately apply for a rental, your application and screening information
        may be shared with the prospective landlord, leasing agent, or screening service
        you authorize.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Retention</h2>
      <p className="mb-6">
        We keep your record for as long as you are an active prospect plus a reasonable
        period afterward (typically 2 years) so we can serve you again if you return. You
        can request deletion at any time using the contact details below.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Your rights</h2>
      <p className="mb-6">
        You can ask us at any time to (a) see what we have on file for you,
        (b) correct it, (c) delete it, or (d) stop contacting you. Use the contact below
        and we&apos;ll respond within a reasonable time.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Children</h2>
      <p className="mb-6">
        This service is not directed to children under 18 and we do not knowingly collect
        information from them.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Changes</h2>
      <p className="mb-6">
        We may update this policy. Material changes will be posted here with a new
        &ldquo;Last updated&rdquo; date.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Contact</h2>
      <p className="mb-6">
        Email: <a className="text-slate-900 underline" href="mailto:morganrentalsphilly@gmail.com">morganrentalsphilly@gmail.com</a><br />
        Operating area: Philadelphia, PA, USA
      </p>

      <p className="text-xs text-slate-400 mt-12">
        See also: <a className="underline" href="/terms">Terms of Service</a>.
      </p>
    </main>
  );
}
