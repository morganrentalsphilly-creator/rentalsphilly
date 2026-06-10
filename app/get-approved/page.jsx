// High-conversion sales page for below-650 intake leads.
// Direct-response structure: pain → turn → authority → offer stack →
// guarantee → FAQ → final CTA. Headline adapts to credit band.
// NOTE: all hype is on pain + value — never promised outcomes (PA + Stripe safety).

export const dynamic = 'force-dynamic';

const GOLD = '#b58e54';

const HEADLINES = {
  '600_649': 'Your credit score is getting you auto-rejected. Here’s how Philly renters like you get approved anyway.',
  below_600: 'Stop paying $50 a pop to get rejected by software. There’s a smarter way into your next Philly rental.',
  default: 'Applying without knowing what landlords will see is a $50 coin flip. Stack the deck first.',
};

const PACKAGES = [
  {
    id: 'application_kit',
    name: 'The Application Kit',
    price: '$9',
    blurb: 'The bare essentials to stop wasting fees — starting tonight.',
    features: [
      'Application checklist & fee tracker',
      'Renter resume template',
      'Scam red flags — never get robbed by a fake listing',
    ],
  },
  {
    id: 'approval_package',
    name: 'The Approval Package',
    price: '$39',
    tag: '★ MOST POPULAR',
    highlight: true,
    blurb: 'Every document, letter, and script we use to get hard-to-approve renters across the finish line.',
    features: [
      'Everything in the Application Kit',
      '3 fill-in-the-blank explanation letters (low credit / eviction / gap) + a finished example',
      '6 landlord outreach scripts — the exact messages that get replies and tours',
      'What Landlords ACTUALLY Check — all 5 screening checks, from inside the industry',
      'Income documentation guide: W-2, gig, cash, benefits, voucher — make it all count',
      'Cosigner request kit + what to do if nobody can cosign',
      'Your Philly legal rights — the screening rules landlords pray you don’t know',
    ],
  },
  {
    id: 'get_approved_kit',
    name: 'The Get Approved Kit',
    price: '$79',
    tag: 'BEST VALUE',
    blurb: 'The full arsenal — including where to find the landlords who say yes.',
    features: [
      'Everything in the Approval Package',
      'The Second-Chance Playbook: find Philly’s flexible private landlords (the ones who never auto-reject)',
      'Negotiation levers: prepaid rent, lease terms, the 90-day trial frame',
      'How to screen the landlord BACK — avoid slumlords using city records',
      'Philly Voucher Navigation Guide included free',
    ],
  },
  {
    id: 'voucher_guide',
    name: 'Voucher Navigation Guide',
    price: '$10',
    blurb: 'Housing Choice Voucher? The complete Philly playbook — timeline, RFTA, inspection, your rights.',
    features: [
      'The full PHA process, step by step, no surprises',
      'Scripts that turn “no Section 8” landlords around',
      'Pass the HQS inspection on the first visit',
    ],
  },
];

const FAQ = [
  [
    'Will this work with an eviction on my record?',
    'That’s exactly who it’s built for. You get the eviction explanation letter formula (with a finished example), plus something most renters never learn: in Philadelphia, landlords legally can’t count evictions over 4 years old, cases they didn’t win, or deny you without an individualized review — and you get the scripts to use those rights.',
  ],
  [
    'Is this just generic advice I can Google?',
    'No. These are the actual documents — fill-in-the-blank letters, a renter resume template, word-for-word landlord scripts — built specifically for Philadelphia by a licensed local agent, including legal rights that only exist in this city.',
  ],
  [
    'What if it doesn’t help me?',
    '7-day money-back guarantee, no questions asked. Email us, you get a refund. The only way we win long-term is if these tools actually work.',
  ],
  [
    'Do I get it instantly?',
    'Yes — downloads appear the second your payment goes through, plus a backup link on your receipt. Most people send their first landlord message within the hour.',
  ],
];

function Cta({ p, lead, band }) {
  return (
    <form action="/api/checkout" method="POST" className="mt-5">
      <input type="hidden" name="lead" value={lead || ''} />
      <input type="hidden" name="band" value={band || ''} />
      <input type="hidden" name="product" value={p.id} />
      <button
        type="submit"
        className="w-full rounded-lg px-6 py-3 text-lg font-bold"
        style={
          p.highlight
            ? { backgroundColor: GOLD, color: 'white' }
            : { border: `2px solid ${GOLD}`, color: GOLD }
        }
      >
        Get instant access — {p.price}
      </button>
    </form>
  );
}

export default async function GetApprovedPage({ searchParams }) {
  const { lead, band } = await searchParams;
  const headline = HEADLINES[band] || HEADLINES.default;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      {/* HERO */}
      <p className="font-bold uppercase tracking-wide" style={{ color: GOLD }}>
        From a licensed Philly rental agent
      </p>
      <h1 className="mt-2 text-4xl font-extrabold leading-tight text-slate-900">{headline}</h1>

      {/* PAIN */}
      <div className="mt-8 rounded-2xl bg-slate-50 p-6">
        <h2 className="text-xl font-bold text-slate-900">Sound familiar?</h2>
        <ul className="mt-3 space-y-2 text-lg text-slate-800">
          {[
            'You find the perfect place. Pay the $50 fee. Hear nothing for a week. Denied.',
            'Nobody tells you WHY — just “we went with another applicant.”',
            'You’ve burned $150+ in fees and you’re no closer to keys in hand.',
            'Meanwhile the clock is ticking on where you live right now.',
          ].map((t) => (
            <li key={t} className="flex gap-3">
              <span className="text-red-500">✗</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* THE TURN */}
      <div className="mt-8 space-y-4 text-lg text-slate-800">
        <p>
          <strong>Here’s what nobody tells you:</strong> at the big property
          companies, a computer rejected you before any human saw your name.
          Below their score cutoff, your application fee buys you an automated no.
        </p>
        <p>
          But here’s the other thing they don’t tell you:{' '}
          <strong>roughly half of Philly’s rentals belong to private landlords</strong>{' '}
          — real people, no algorithm — who approve renters with bruised credit
          every single day. The renters who win with them aren’t luckier or
          richer. They show up with the right documents, the right letter, and
          the right words.
        </p>
        <p>
          After years of getting Philly renters approved as a licensed agent, we
          packaged that exact playbook — every document, letter, and script — so
          you can use it tonight.
        </p>
      </div>

      {/* [MORGAN: add 2-3 REAL testimonials here as you collect them —
          first name + neighborhood. Real ones only.] */}

      {/* OFFER STACK */}
      <h2 className="mt-12 text-3xl font-extrabold text-slate-900">Pick your toolkit</h2>
      <p className="mt-1 text-slate-600">
        Instant download · built for Philadelphia · 7-day money-back guarantee
      </p>
      <div className="mt-6 space-y-6">
        {PACKAGES.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border-2 p-6"
            style={{
              borderColor: p.highlight ? GOLD : '#e2e8f0',
              backgroundColor: p.highlight ? '#FAF5EC' : 'white',
            }}
          >
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-2xl font-bold text-slate-900">{p.name}</h3>
              <div className="text-right">
                {p.tag && (
                  <div className="text-xs font-extrabold tracking-wide" style={{ color: GOLD }}>
                    {p.tag}
                  </div>
                )}
                <div className="text-3xl font-extrabold text-slate-900">{p.price}</div>
              </div>
            </div>
            <p className="mt-1 text-slate-700">{p.blurb}</p>
            <ul className="mt-4 space-y-2">
              {p.features.map((f) => (
                <li key={f} className="flex gap-3 text-slate-800">
                  <span style={{ color: GOLD }}>✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Cta p={p} lead={lead} band={band} />
          </div>
        ))}
      </div>

      {/* MATH */}
      <div className="mt-10 rounded-2xl border-2 p-6" style={{ borderColor: GOLD }}>
        <h2 className="text-xl font-bold text-slate-900">Do the math</h2>
        <p className="mt-2 text-lg text-slate-800">
          One application fee: <strong>$35–75, non-refundable.</strong> The
          average renter with credit challenges burns <strong>3–6 fees
          ($150–300)</strong> applying to places that were never going to say
          yes. Every tool on this page costs less than the fees it stops you
          from wasting — and unlike a fee, it works on every application until
          you have keys.
        </p>
      </div>

      {/* GUARANTEE */}
      <div className="mt-8 rounded-2xl bg-slate-50 p-6 text-center">
        <div className="text-3xl">🛡️</div>
        <h2 className="mt-2 text-xl font-bold text-slate-900">The no-risk guarantee</h2>
        <p className="mx-auto mt-2 max-w-xl text-slate-700">
          Open everything. Use everything. If within 7 days you don’t believe
          it was worth it, one email gets you a full refund — no questions, no
          hoops.
        </p>
      </div>

      {/* FAQ */}
      <h2 className="mt-12 text-2xl font-bold text-slate-900">Questions, answered straight</h2>
      <div className="mt-4 space-y-5">
        {FAQ.map(([q, a]) => (
          <div key={q}>
            <h3 className="font-bold text-slate-900">{q}</h3>
            <p className="mt-1 text-slate-700">{a}</p>
          </div>
        ))}
      </div>

      {/* FINAL CTA */}
      <div className="mt-12 rounded-2xl p-8 text-center" style={{ backgroundColor: '#FAF5EC' }}>
        <h2 className="text-2xl font-extrabold text-slate-900">
          The next great listing goes up tomorrow morning.
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-lg text-slate-700">
          The renter who gets it won’t have better credit than you — they’ll
          have a better application. Be that renter by tonight.
        </p>
        <div className="mx-auto mt-5 max-w-md">
          <Cta p={PACKAGES[1]} lead={lead} band={band} />
        </div>
        <p className="mt-3 text-sm text-slate-500">Instant download · 7-day money-back guarantee</p>
      </div>

      <p className="mt-10 text-sm text-slate-500">
        Educational materials based on real-world rental experience in
        Philadelphia. Not legal or credit-repair advice. No specific outcome is
        promised — results depend on your situation and effort.
      </p>
    </main>
  );
}
