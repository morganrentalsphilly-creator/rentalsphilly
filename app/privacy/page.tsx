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
        policy explains what we collect when you use our website at
        rentalsphilly.vercel.app (the &ldquo;Site&rdquo;), what we do with it, and your
        choices.
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
        <strong>Program name:</strong> Rentals Philly SMS<br />
        <strong>Program description:</strong> When you submit our intake form on
        rentalsphilly.vercel.app and provide your mobile phone number, you opt in to
        receive recurring SMS text messages from Rentals Philly about rental listings
        matching your criteria, showing confirmations, appointment reminders, and replies
        to your own messages.
      </p>
      <p className="mb-3">
        <strong>Consent is not a condition of any purchase.</strong> You do not have to
        receive SMS to receive service from us — you can choose to communicate by email
        instead.
      </p>
      <ul className="list-disc pl-6 mb-3 space-y-1">
        <li><strong>Message frequency varies</strong> based on your activity. A typical lead receives 5–10 messages over the search-to-lease window (about 2–8 weeks).</li>
        <li><strong>Message and data rates may apply</strong> per your mobile carrier.</li>
        <li><strong>To opt out, reply STOP</strong> to any of our messages. You will receive one confirmation message and we will not contact you by SMS again unless you reply START.</li>
        <li><strong>For help, reply HELP</strong> or email morganrentalsphilly@gmail.com.</li>
        <li>Supported carriers include AT&amp;T, T-Mobile, Verizon, Sprint, Boost, Cricket, MetroPCS, U.S. Cellular, Virgin Mobile, and most other US carriers. Carriers are not liable for delayed or undelivered messages.</li>
      </ul>
      <p className="mb-3">
        <strong>Example messages you may receive:</strong>
      </p>
      <ul className="list-disc pl-6 mb-3 space-y-1 text-sm bg-slate-50 border border-slate-200 rounded-lg p-4">
        <li>&ldquo;Rentals Philly: Got it Alex — I&apos;m hand-picking rentals that fit you. Expect a personalized link with photos within a few hours.&rdquo;</li>
        <li>&ldquo;Rentals Philly: Your hand-picked rentals are ready. View photos &amp; request tours: [link]&rdquo;</li>
        <li>&ldquo;Reminder: your showing is tomorrow at 5:00 PM. Reply if you need to reschedule.&rdquo;</li>
      </ul>
      <p className="mb-3">
        <strong>No mobile information will be shared with third parties or affiliates
        for marketing or promotional purposes.</strong> All categories of information
        we collect exclude text messaging originator opt-in data and consent; this
        information will not be shared with any third parties. Mobile information is
        used solely to operate this SMS program. Carriers may apply their own privacy
        policies to messages traversing their networks.
      </p>
      <p className="mb-6">
        We will not sell, rent, lease, or otherwise transfer your mobile phone number,
        SMS consent status, or mobile-originator opt-in data to any third party,
        affiliate, marketer, or advertiser.
      </p>

      <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-3">Who we share with</h2>
      <p className="mb-6">
        We use a small set of service providers to operate the site: Supabase (database
        and authentication), Twilio (SMS delivery), Resend (email delivery), Vercel
        (hosting), and licensed real estate listing data feeds. Your information is only
        shared with these providers to the extent necessary for them to provide their
        service. <strong>We do not sell or rent your information, and we never share it
        with third parties for their own marketing.</strong>
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
