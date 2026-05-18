'use client';

// Public lead-facing curated page — TWO-PHASE workflow on a single URL.
//
// Phase 1 (initial): "Open BrightMLS portal → tell us which properties you like."
// Phase awaiting-scheduling: "We got your picks — your agent is reviewing availability."
// Phase 2 (agent activated time picker): "Pick your tour times."
// Phase 3 (done): "All set."
//
// The page polls /api/curated/[token] for the latest phase state, so if a
// lead leaves the page after phase 1 and comes back via the scheduling SMS,
// they automatically land in phase 2.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

const DEFAULT_SLOT_TEMPLATE = {
  0: [],
  1: [],
  2: ['5:00 PM', '6:00 PM'],
  3: ['5:00 PM', '6:00 PM'],
  4: ['5:00 PM', '6:00 PM'],
  5: ['5:00 PM', '6:00 PM'],
  6: ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM'],
};
const DAYS_AHEAD = 14;

// Generate slots from availability data (or default if none). Excludes:
//   - slots within 24h (lead time buffer)
//   - dates in blocked_dates
//   - slots already booked by other tours
function generateSlots(availability, bookedSlots) {
  const template = (availability?.weekly && Object.keys(availability.weekly).length > 0)
    ? availability.weekly
    : DEFAULT_SLOT_TEMPLATE;
  const blockedDates = new Set(availability?.blocked_dates || []);
  const bookedSet = new Set(bookedSlots || []);

  const slots = [];
  const now = new Date();
  const minStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const dateStr = d.toISOString().slice(0, 10);
    if (blockedDates.has(dateStr)) continue;
    const dow = d.getDay();
    const times = template[dow] || template[String(dow)] || [];
    for (const t of times) {
      const [hStr, mStrAmpm] = t.split(':');
      const h12 = parseInt(hStr, 10);
      const ampm = mStrAmpm.slice(-2);
      const m = parseInt(mStrAmpm.slice(0, 2), 10);
      const h24 = ampm === 'PM' && h12 !== 12 ? h12 + 12 : ampm === 'AM' && h12 === 12 ? 0 : h12;
      const slotDate = new Date(d);
      slotDate.setHours(h24, m, 0, 0);
      if (slotDate < minStart) continue;
      const slotId = `${dateStr}_${t.replace(/[:\s]/g, '')}`;
      if (bookedSet.has(slotId)) continue;
      slots.push({ id: slotId, date: dateStr, time: t });
    }
  }
  return slots;
}

function fmtSlotDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

const Header = ({ firstName }) => (
  <header className="bg-white border-b border-slate-200 px-5 md:px-8 py-4 sticky top-0 z-20">
    <div className="max-w-3xl mx-auto">
      <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--brand-gold)' }}>
        Rentals Philly
      </div>
      <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
        Hi {firstName} — your hand-picked rentals
      </h1>
    </div>
  </header>
);

const StepNum = ({ n }) => (
  <div
    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
    style={{ backgroundColor: 'var(--brand-gold)' }}
  >
    {n}
  </div>
);

export default function CuratedPage() {
  const params = useParams();
  const token = params?.token;
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [opened, setOpened] = useState(false);

  // Phase 1 state
  const [addressesText, setAddressesText] = useState('');
  const [note, setNote] = useState('');
  const [submitting1, setSubmitting1] = useState(false);

  // Phase 2 state — pick a time per property
  const [picksByAddr, setPicksByAddr] = useState({});  // { address: { slotDate, slotTime } }
  const [note2, setNote2] = useState('');
  const [submitting2, setSubmitting2] = useState(false);

  const loadData = () => {
    if (!token) return;
    fetch(`/api/curated/${token}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d) => {
        setData(d);
        setLoadError(null);
      })
      .catch((e) => setLoadError(String(e)));
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const slots = useMemo(
    () => generateSlots(data?.availability, data?.bookedSlots),
    [data?.availability, data?.bookedSlots]
  );
  const slotsByDate = useMemo(() => {
    const map = {};
    for (const s of slots) (map[s.date] = map[s.date] || []).push(s);
    return map;
  }, [slots]);

  if (loadError) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center bg-slate-50">
        <div>
          <div className="text-2xl font-semibold text-slate-900 mb-2">Link not found</div>
          <div className="text-slate-500">This link may have expired. Reach out to your agent for a fresh one.</div>
        </div>
      </main>
    );
  }
  if (!data) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400 text-sm bg-slate-50">Loading…</main>;
  }

  const firstName = data.firstName || 'there';
  const agentLabel = data.agentName && data.agentName !== '[Your name]' ? data.agentName : 'your agent';
  const portalUrl = data.portalUrl;
  const phase = data.phase;
  const selectedAddrs = data.selectedAddresses || [];

  // ============================================================
  // PHASE 1 — pick properties
  // ============================================================
  if (phase === 1) {
    const parsedAddresses = addressesText.split('\n').map(s => s.trim()).filter(Boolean);

    const submit1 = async () => {
      if (parsedAddresses.length === 0) {
        alert('Tell us which properties you like — paste addresses from the BrightMLS tab, one per line.');
        return;
      }
      setSubmitting1(true);
      try {
        const res = await fetch(`/api/curated/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 1, addresses: parsedAddresses, note }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'Submit failed');
        }
        loadData(); // re-fetch — phase will be 'awaiting-scheduling'
      } catch (e) {
        alert('Something went wrong: ' + e.message);
      } finally {
        setSubmitting1(false);
      }
    };

    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Header firstName={firstName} />
        <main className="flex-1 max-w-3xl w-full mx-auto px-5 md:px-8 py-6 md:py-10 space-y-7 pb-28">
          <div className="rounded-2xl bg-white border border-slate-200 p-5">
            <p className="text-[15px] text-slate-700 leading-relaxed">
              {agentLabel} hand-picked rentals for you on BrightMLS. Browse the photos, then tell us which
              ones interest you. We&apos;ll check availability and send you a scheduling link with open times.
            </p>
          </div>

          <section>
            <div className="flex items-center gap-3 mb-3">
              <StepNum n={1} />
              <h2 className="text-base font-semibold text-slate-900">Browse on BrightMLS</h2>
            </div>
            {portalUrl ? (
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpened(true)}
                className="block rounded-2xl p-5 border-2 transition-colors text-center hover:shadow-md"
                style={{ backgroundColor: 'var(--brand-gold-soft)', borderColor: 'var(--brand-gold)' }}
              >
                <div className="text-sm font-semibold text-slate-900 mb-1">Open your listings on BrightMLS</div>
                <div className="text-xs text-slate-600">Opens in a new tab — full photo galleries & details</div>
              </a>
            ) : (
              <div className="rounded-2xl p-5 border-2 border-dashed border-slate-300 text-center text-sm text-slate-500">
                Your agent will send the BrightMLS link shortly.
              </div>
            )}
            {opened && (
              <div className="text-[11px] text-slate-500 mt-2 text-center">
                Tab opened ✓ — come back here when you&apos;ve picked the ones you like.
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-3 mb-3">
              <StepNum n={2} />
              <h2 className="text-base font-semibold text-slate-900">Which ones do you like?</h2>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              Copy addresses from the BrightMLS tab — one per line. No need to be exact, anything that
              identifies the listing works.
            </p>
            <textarea
              value={addressesText}
              onChange={(e) => setAddressesText(e.target.value)}
              rows={5}
              placeholder={`1420 Pine St #3B\n234 N 3rd St\n876 S 4th St`}
              className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:border-slate-900 resize-y font-mono"
            />
            {parsedAddresses.length > 0 && (
              <div className="text-[11px] text-slate-500 mt-1.5 text-right">
                {parsedAddresses.length} {parsedAddresses.length === 1 ? 'property' : 'properties'}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-3 mb-3">
              <StepNum n={3} />
              <h2 className="text-base font-semibold text-slate-900">
                Anything else? <span className="text-slate-400 font-normal text-sm">(optional)</span>
              </h2>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Questions, must-haves, or constraints…"
              className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-slate-400 resize-none bg-white"
            />
          </section>
        </main>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 md:px-8 py-3.5 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)] z-20">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div className="text-xs md:text-sm text-slate-600">
              {parsedAddresses.length > 0
                ? <><span className="font-semibold text-slate-900">{parsedAddresses.length}</span> selected — {agentLabel} will follow up</>
                : 'Pick the ones you like'}
            </div>
            <button
              onClick={submit1}
              disabled={submitting1 || parsedAddresses.length === 0}
              className="px-6 py-2.5 rounded-full text-sm font-semibold text-white disabled:opacity-30 transition-colors"
              style={{ backgroundColor: 'var(--brand-gold)' }}
            >
              {submitting1 ? 'Sending…' : 'Send to my agent'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // PHASE: AWAITING-SCHEDULING — agent hasn't sent the time picker yet
  // ============================================================
  if (phase === 'awaiting-scheduling') {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Header firstName={firstName} />
        <main className="flex-1 max-w-xl w-full mx-auto px-5 md:px-8 py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-6 text-2xl">✓</div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-3">Got your picks, {firstName}.</h2>
          <p className="text-slate-600 leading-relaxed mb-5">
            {agentLabel} is checking availability on your {selectedAddrs.length} {selectedAddrs.length === 1 ? 'property' : 'properties'}.
            You&apos;ll get a text shortly with open tour times — come back to this page to pick.
          </p>
          {selectedAddrs.length > 0 && (
            <div className="rounded-2xl bg-white border border-slate-200 p-4 text-left max-w-md mx-auto">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Your picks</div>
              <ul className="space-y-1.5 text-sm text-slate-700">
                {selectedAddrs.map((a) => <li key={a}>• {a}</li>)}
              </ul>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ============================================================
  // PHASE 2 — pick tour times for each property
  // ============================================================
  if (phase === 2) {
    const allPicked = selectedAddrs.every((a) => picksByAddr[a]?.slotDate && picksByAddr[a]?.slotTime);

    const pickFor = (addr, slot) => {
      setPicksByAddr((prev) => ({ ...prev, [addr]: { slotDate: slot.date, slotTime: slot.time } }));
    };

    const submit2 = async () => {
      if (!allPicked) {
        alert('Pick a time for every property.');
        return;
      }
      setSubmitting2(true);
      try {
        const picks = selectedAddrs.map((address) => ({
          address,
          slotDate: picksByAddr[address].slotDate,
          slotTime: picksByAddr[address].slotTime,
        }));
        const res = await fetch(`/api/curated/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 2, picks, note: note2 }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'Submit failed');
        }
        loadData();
      } catch (e) {
        alert('Something went wrong: ' + e.message);
      } finally {
        setSubmitting2(false);
      }
    };

    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Header firstName={firstName} />
        <main className="flex-1 max-w-3xl w-full mx-auto px-5 md:px-8 py-6 md:py-10 space-y-7 pb-28">
          <div className="rounded-2xl bg-white border border-slate-200 p-5">
            <p className="text-[15px] text-slate-700 leading-relaxed">
              Great news — {agentLabel} has confirmed availability. Pick a time that works for each property below.
            </p>
          </div>

          {selectedAddrs.map((addr, idx) => {
            const pick = picksByAddr[addr];
            return (
              <section key={addr} className="rounded-2xl bg-white border-2 border-slate-200 p-5">
                <div className="flex items-center gap-3 mb-1">
                  <StepNum n={idx + 1} />
                  <div className="font-semibold text-slate-900 text-base truncate">{addr}</div>
                </div>
                {pick?.slotDate && pick?.slotTime ? (
                  <div className="mb-3 ml-10 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 inline-block">
                    ✓ {fmtSlotDate(pick.slotDate)} at {pick.slotTime}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 mb-3 ml-10">Pick a time below</p>
                )}
                <div className="ml-10 space-y-3 max-h-72 overflow-y-auto pr-1">
                  {Object.entries(slotsByDate).map(([date, daySlots]) => (
                    <div key={date}>
                      <div className="text-xs font-medium text-slate-700 mb-1.5">{fmtSlotDate(date)}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {daySlots.map((s) => {
                          const isOn = pick?.slotDate === s.date && pick?.slotTime === s.time;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => pickFor(addr, s)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                isOn
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                              }`}
                            >
                              {s.time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          <section>
            <div className="flex items-center gap-3 mb-3">
              <StepNum n={selectedAddrs.length + 1} />
              <h2 className="text-base font-semibold text-slate-900">
                Anything else? <span className="text-slate-400 font-normal text-sm">(optional)</span>
              </h2>
            </div>
            <textarea
              value={note2}
              onChange={(e) => setNote2(e.target.value)}
              rows={3}
              placeholder="Constraints, parking notes, etc…"
              className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-slate-400 resize-none bg-white"
            />
          </section>
        </main>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 md:px-8 py-3.5 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)] z-20">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div className="text-xs md:text-sm text-slate-600">
              {allPicked ? 'All set — submit to confirm' : `${Object.keys(picksByAddr).length}/${selectedAddrs.length} times picked`}
            </div>
            <button
              onClick={submit2}
              disabled={submitting2 || !allPicked}
              className="px-6 py-2.5 rounded-full text-sm font-semibold text-white disabled:opacity-30 transition-colors"
              style={{ backgroundColor: 'var(--brand-gold)' }}
            >
              {submitting2 ? 'Sending…' : 'Confirm tours'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // PHASE 3 — all done
  // ============================================================
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header firstName={firstName} />
      <main className="flex-1 max-w-xl w-full mx-auto px-5 md:px-8 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-6 text-2xl">✓</div>
        <h2 className="text-2xl font-semibold text-slate-900 mb-3">All set, {firstName}.</h2>
        <p className="text-slate-600 leading-relaxed mb-2">
          {agentLabel} will confirm your tour times and send you calendar invites shortly. Watch your text + email.
        </p>
      </main>
    </div>
  );
}
