// Results-style sales page for below-650 intake leads.
// Opens as a personalized "here's where you stand" analysis (seamless from
// the intake form), then moves into the offer stack. All hype is on pain +
// value — never promised outcomes (PA + Stripe safety).

export const dynamic = 'force-dynamic';

const GOLD = '#b58e54';

const BAND_LABEL = { below_600: 'Below 600', '600_649': '600–649' };

const VERDICT = {
  '600_649':
    'At 600–649, most big property companies auto-screen you out before a human reads your application — but you’re inside the range where private landlords say yes every day when the paperwork is right. Your odds problem isn’t your score. It’s your presentation and your targets.',
  below_600:
    'Below 600, applying to big property managers is a losing game — their software denies you automatically, $50 at a time. But Philly has thousands of private landlords who decide with their gut, not an algorithm. With the right documents and the right approach, that’s your market.',
  default:
    'Without knowing your exact credit picture, every application is a $50 coin flip. The first move is knowing exactly what landlords will see — the second is showing up with paperwork so strong it answers every question before it’s asked.',
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

function fmtBudget(bd) {
  const n = Number(bd);
  return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString()}/mo` : null;
}

function fmtMove(mv) {
  if (!mv) return null;
  const d = new Date(mv);
  if (isNaN(d.getTime())) return mv;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Cta({ p, lead, band }) {
  return (
    <form action="/api/checkout" method="POST" className="mt-5">
      <input type="hidden" name="lead" value={lead || ''} />
      <input type="hidden" name="band" value={band || ''} />
      <input type="hidden" name="product" value={p.id} />
      <button
        type="submit"
        className="w-full rounded-xl px-6 py-3.5 text-lg font-bold transition-transform active:scale-[0.99]"
        style={
          p.highlight
            ? { backgroundColor: GOLD, color: 'white' }
            : { border: `2px solid ${GOLD}`, color: GOLD, backgroundColor: 'white' }
        }
      >
        Get instant access — {p.price}
      </button>
    </form>
  );
}

export default async function GetApprovedPage({ searchParams }) {
  const { lead, band, fn, bd, mv } = await searchParams;
  const verdict = VERDICT[band] || VERDICT.default;
  const name = (fn || '').replace(/[^a-zA-Z'’-]/g, '').slice(0, 20);
  const budget = fmtBudget(bd);
  const move = fmtMove(mv);
  const bandLabel = BAND_LABEL[band];

  const chips = [
    bandLabel && `Credit: ${bandLabel}`,
    budget && `Budget: ${budget}`,
    move && `Moving: ${move}`,
  ].filter(Boolean);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* ===== RESULTS HEADER — reads as analysis output, not an ad ===== */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100">✓</span>
            Profile received
          </div>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight text-slate-900 md:text-4xl">
            {name ? `${name}, here’s where you stand.` : 'Here’s where you stand.'}
          </h1>
          {chips.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {chips.map((c) => (
                <span key={c} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                  {c}
                </span>
              ))}
            </div>
          )}
          <p className="mt-5 text-lg leading-relaxed text-slate-800">{verdict}</p>

          {/* Two paths */}
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold uppercase tracking-wide text-slate-400">The path most renters take</div>
              <p className="mt-2 text-slate-700">
                Apply to big property companies → automated screening → denied below
                their cutoff → <strong>$50 gone per try</strong>, no explanation, repeat.
              </p>
            </div>
            <div className="rounded-xl border-2 p-4" style={{ borderColor: GOLD, backgroundColor: '#FAF5EC' }}>
              <div className="text-sm font-bold uppercase tracking-wide" style={{ color: GOLD }}>Your path</div>
              <p className="mt-2 text-slate-800">
                Target Philly’s <strong>private landlords</strong> — humans, not
                algorithms — armed with the documents, letters, and scripts that
                make “yes” easy.
              </p>
            </div>
          </div>
        </div>

        {/* ===== BRIDGE ===== */}
        <div className="mt-8 space-y-4 px-1 text-lg text-slate-800">
          <p>
            <strong>Straight talk:</strong> sending you to an agent right now would
            waste your time — the buildings agents work with run the same automated
            screening that’s been rejecting you. What actually moves the needle in
            your range is the paperwork you show up with and the landlords you
            target. We’ve packaged years of doing exactly that for Philly renters
            into toolkits you can use tonight.
          </p>
        </div>

        {/* [MORGAN: add 2-3 REAL testimonials here as you collect them —
            first name + neighborhood. Real ones only.] */}

        {/* ===== OFFER STACK ===== */}
        <h2 className="mt-10 text-3xl font-extrabold text-slate-900">Pick your toolkit</h2>
        <p className="mt-1 text-slate-600">Instant download · built for Philadelphia · 7-day money-back guarantee</p>
        <div className="mt-6 space-y-6">
          {PACKAGES.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
              style={p.highlight ? { boxShadow: `0 0 0 2px ${GOLD}`, backgroundColor: '#FFFDF8' } : undefined}
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

        {/* ===== MATH ===== */}
        <div className="mt-10 rounded-2xl bg-white p-6 shadow-sm ring-2" style={{ '--tw-ring-color': GOLD }}>
          <h2 className="text-xl font-bold text-slate-900">Do the math</h2>
          <p className="mt-2 text-lg text-slate-800">
            One application fee: <strong>$35–75, non-refundable.</strong> The average
            renter with credit challenges burns <strong>3–6 fees ($150–300)</strong>{' '}
            applying to places that were never going to say yes. Every toolkit here
            costs less than the fees it stops you from wasting — and unlike a fee,
            it works on every application until you have keys.
          </p>
        </div>

        {/* ===== GUARANTEE ===== */}
        <div className="mt-8 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <div className="text-3xl">🛡️</div>
          <h2 className="mt-2 text-xl font-bold text-slate-900">The no-risk guarantee</h2>
          <p className="mx-auto mt-2 max-w-xl text-slate-700">
            Open everything. Use everything. If within 7 days you don’t believe it
            was worth it, one email gets you a full refund — no questions, no hoops.
          </p>
        </div>

        {/* ===== FAQ ===== */}
        <h2 className="mt-12 text-2xl font-bold text-slate-900">Questions, answered straight</h2>
        <div className="mt-4 space-y-5">
          {FAQ.map(([q, a]) => (
            <div key={q} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h3 className="font-bold text-slate-900">{q}</h3>
              <p className="mt-1 text-slate-700">{a}</p>
            </div>
          ))}
        </div>

        {/* ===== FINAL CTA ===== */}
        <div className="mt-12 rounded-2xl p-8 text-center" style={{ backgroundColor: '#FAF5EC' }}>
          <h2 className="text-2xl font-extrabold text-slate-900">
            The next great listing goes up tomorrow morning.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-lg text-slate-700">
            The renter who gets it won’t have better credit than you — they’ll have
            a better application. Be that renter by tonight.
          </p>
          <div className="mx-auto mt-5 max-w-md">
            <Cta p={PACKAGES[1]} lead={lead} band={band} />
          </div>
          <p className="mt-3 text-sm text-slate-500">Instant download · 7-day money-back guarantee</p>
        </div>

        <p className="mt-10 pb-6 text-sm text-slate-500">
          Educational materials based on real-world rental experience in
          Philadelphia. Not legal or credit-repair advice. No specific outcome is
          promised — results depend on your situation and effort.
        </p>
      </div>
    </main>
  );
}
