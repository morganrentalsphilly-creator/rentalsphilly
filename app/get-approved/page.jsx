// /get-approved — results-style sales page for below-650 intake leads.
// Production version: mobile-first, sticky buy bar (mirrors the intake form's
// UX), trust signals, personalized verdict. All claims are pain/value-based —
// never promised outcomes (PA + Stripe compliance).

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Get Approved — Rentals Philly',
  description:
    'The documents, letters, and scripts Philly renters use to get approved with low credit, past evictions, or thin rental history. Built by a licensed local agent.',
};

const GOLD = '#b58e54';
const GOLD_DARK = '#9a7843';

const BAND_LABEL = { below_600: 'Below 600', '600_649': '600–649' };

const VERDICT = {
  '600_649':
    'At 600–649, big property companies auto-screen you out before a human ever reads your application — but you’re inside the range where private landlords say yes every day when the paperwork is right. Your problem isn’t your score. It’s your presentation and your targets.',
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
    note: 'The essentials',
    blurb: 'Stop wasting application fees — starting tonight.',
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
    tag: 'MOST POPULAR',
    highlight: true,
    blurb: 'Every document, letter, and script we use to get hard-to-approve renters across the finish line.',
    features: [
      'Everything in the Application Kit',
      '3 fill-in-the-blank explanation letters — low credit, past eviction, history gap — plus a finished example to copy',
      '6 landlord outreach scripts: the exact messages that get replies and tours',
      'What Landlords ACTUALLY Check — all 5 screening checks, from inside the industry',
      'Income documentation guide: W-2, gig, cash, benefits, voucher — make every dollar count',
      'Cosigner request kit + what to do if nobody can cosign',
      'Your Philadelphia legal rights — the screening rules landlords pray you don’t know',
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
      'The Second-Chance Playbook: where Philly’s flexible private landlords actually list — and how to spot them',
      'Negotiation levers: prepaid rent, lease terms, the 90-day trial frame',
      'How to screen the landlord BACK — avoid slumlords using city records',
      'Philly Voucher Navigation Guide included free',
    ],
  },
  {
    id: 'voucher_guide',
    name: 'Voucher Navigation Guide',
    price: '$10',
    note: 'For voucher holders',
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
    '7-day money-back guarantee, no questions asked. One email, full refund. The only way we win long-term is if these tools actually work.',
  ],
  [
    'Do I get it instantly?',
    'Yes — your downloads open the second payment goes through, plus a backup link on your receipt. Most people send their first landlord message within the hour.',
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

function Cta({ p, lead, band, big }) {
  return (
    <form action="/api/checkout" method="POST" className={big ? '' : 'mt-5'}>
      <input type="hidden" name="lead" value={lead || ''} />
      <input type="hidden" name="band" value={band || ''} />
      <input type="hidden" name="product" value={p.id} />
      <button
        type="submit"
        className={`w-full rounded-xl font-bold transition-transform active:scale-[0.99] ${
          big ? 'px-6 py-4 text-xl' : 'px-6 py-3.5 text-lg'
        }`}
        style={
          p.highlight || big
            ? { background: `linear-gradient(180deg, ${GOLD}, ${GOLD_DARK})`, color: 'white', boxShadow: '0 2px 12px rgba(181,142,84,0.4)' }
            : { border: `2px solid ${GOLD}`, color: GOLD_DARK, backgroundColor: 'white' }
        }
      >
        Get instant access — {p.price}
      </button>
    </form>
  );
}

function TrustRow() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs font-medium text-slate-500">
      <span>🔒 Secure checkout by Stripe</span>
      <span>⚡ Instant download</span>
      <span>🛡️ 7-day money-back guarantee</span>
    </div>
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
    budget && budget !== '$0/mo' && `Budget: ${budget}`,
    move && `Moving: ${move}`,
  ].filter(Boolean);

  return (
    <main className="min-h-screen bg-slate-50">
      {/* pb leaves room for the sticky mobile buy bar */}
      <div className="mx-auto max-w-3xl px-4 pb-32 pt-8 md:pb-16 md:pt-12">
        {/* ===== RESULTS CARD ===== */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${GOLD}, ${GOLD_DARK})` }} />
          <div className="p-6 md:p-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs">✓</span>
              Profile received
            </div>
            <h1 className="mt-3 text-[28px] font-extrabold leading-[1.15] tracking-[-0.02em] text-slate-900 md:text-4xl">
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
            <p className="mt-5 text-[17px] leading-relaxed text-slate-800">{verdict}</p>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">What most renters do</div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-slate-700">
                  Apply to big property companies → automated screening → denied →{' '}
                  <strong>$50 gone per try</strong>, no explanation, repeat.
                </p>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: '#FAF5EC', border: `2px solid ${GOLD}` }}>
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: GOLD_DARK }}>
                  Your path
                </div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-slate-800">
                  Target Philly’s <strong>private landlords</strong> — humans, not
                  algorithms — armed with documents, letters, and scripts that make
                  “yes” easy.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ===== BRIDGE ===== */}
        <div className="mt-7 px-1 text-[17px] leading-relaxed text-slate-800">
          <p>
            <strong>Straight talk:</strong> sending you to an agent right now would
            waste your time — the buildings agents work with run the same automated
            screening that’s been rejecting you. What actually moves the needle in
            your range is the paperwork you show up with and the landlords you
            target. As licensed Philly agents, we packaged years of doing exactly
            that into toolkits you can use tonight.
          </p>
        </div>

        {/* [MORGAN: insert 2-3 REAL testimonials here as buyers send them —
            first name + neighborhood, real ones only. This slot will outconvert
            everything else on the page.] */}

        {/* ===== OFFER STACK ===== */}
        <div className="mt-10">
          <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-slate-900 md:text-3xl">Pick your toolkit</h2>
          <div className="mt-2"><TrustRow /></div>
        </div>

        <div className="mt-5 space-y-5">
          {PACKAGES.map((p) => (
            <div
              key={p.id}
              id={p.id}
              className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
              style={p.highlight ? { boxShadow: `0 0 0 2px ${GOLD}, 0 8px 24px -12px rgba(181,142,84,0.5)`, backgroundColor: '#FFFDF8' } : undefined}
            >
              {p.tag && (
                <div
                  className="-mt-9 mb-3 inline-block rounded-full px-3 py-1 text-xs font-extrabold tracking-wide text-white"
                  style={{ background: `linear-gradient(180deg, ${GOLD}, ${GOLD_DARK})` }}
                >
                  {p.tag}
                </div>
              )}
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-xl font-bold text-slate-900 md:text-2xl">{p.name}</h3>
                <div className="text-3xl font-extrabold tabular-nums text-slate-900">{p.price}</div>
              </div>
              {p.note && <div className="mt-0.5 text-sm font-medium text-slate-500">{p.note}</div>}
              <p className="mt-2 text-slate-700">{p.blurb}</p>
              <ul className="mt-4 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-3 text-[15px] leading-relaxed text-slate-800">
                    <span className="mt-0.5 shrink-0 font-bold" style={{ color: GOLD_DARK }}>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Cta p={p} lead={lead} band={band} />
            </div>
          ))}
        </div>

        {/* ===== MATH ===== */}
        <div className="mt-9 rounded-2xl bg-slate-900 p-6 text-white md:p-7">
          <h2 className="text-lg font-bold">Do the math</h2>
          <p className="mt-2 leading-relaxed text-slate-200">
            One application fee: <strong className="text-white">$35–75, non-refundable.</strong>{' '}
            The average renter with credit challenges burns{' '}
            <strong className="text-white">3–6 fees ($150–300)</strong> applying to
            places that were never going to say yes. Every toolkit here costs less
            than the fees it stops you from wasting — and unlike a fee, it works on
            every application until you have keys.
          </p>
        </div>

        {/* ===== GUARANTEE ===== */}
        <div className="mt-7 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <div className="text-3xl">🛡️</div>
          <h2 className="mt-2 text-xl font-bold text-slate-900">The no-risk guarantee</h2>
          <p className="mx-auto mt-2 max-w-xl leading-relaxed text-slate-700">
            Open everything. Use everything. If within 7 days you don’t believe it
            was worth it, one email gets you a full refund — no questions, no hoops.
          </p>
        </div>

        {/* ===== FAQ ===== */}
        <h2 className="mt-11 text-2xl font-bold text-slate-900">Questions, answered straight</h2>
        <div className="mt-4 space-y-4">
          {FAQ.map(([q, a]) => (
            <div key={q} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h3 className="font-bold text-slate-900">{q}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-slate-700">{a}</p>
            </div>
          ))}
        </div>

        {/* ===== FINAL CTA ===== */}
        <div className="mt-11 rounded-2xl p-7 text-center md:p-9" style={{ backgroundColor: '#FAF5EC' }}>
          <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-slate-900">
            The next great listing goes up tomorrow morning.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-[17px] leading-relaxed text-slate-700">
            The renter who gets it won’t have better credit than you — they’ll have
            a better application. Be that renter by tonight.
          </p>
          <div className="mx-auto mt-5 max-w-md">
            <Cta p={PACKAGES[1]} lead={lead} band={band} big />
          </div>
          <div className="mt-3"><TrustRow /></div>
        </div>

        <p className="mt-9 text-[13px] leading-relaxed text-slate-500">
          Educational materials based on real-world rental experience in
          Philadelphia. Not legal or credit-repair advice. No specific outcome is
          promised — results depend on your situation and effort. Questions?
          Reply to any email from us and a real person answers.
        </p>
      </div>

      {/* ===== STICKY MOBILE BUY BAR — mirrors the intake form's bottom CTA ===== */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate-200 bg-white/95 shadow-[0_-4px_24px_-12px_rgba(0,0,0,0.15)] backdrop-blur md:hidden">
        <div className="mx-auto max-w-3xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <form action="/api/checkout" method="POST">
            <input type="hidden" name="lead" value={lead || ''} />
            <input type="hidden" name="band" value={band || ''} />
            <input type="hidden" name="product" value="approval_package" />
            <button
              type="submit"
              className="w-full rounded-xl px-6 py-3.5 text-base font-bold text-white"
              style={{ background: `linear-gradient(180deg, ${GOLD}, ${GOLD_DARK})` }}
            >
              Get the Approval Package — $39 →
            </button>
          </form>
          <div className="mt-1.5 text-center text-[11px] text-slate-500">
            Instant download · 7-day money-back guarantee
          </div>
        </div>
      </div>
    </main>
  );
}
