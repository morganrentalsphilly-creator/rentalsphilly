'use client';

// Public lead-facing curated page — TWO-PHASE workflow on a single URL.
//
// Phase 1 (initial): "Open the portal → tell us which properties you like."
// Phase awaiting-scheduling: "We got your picks — your agent is reviewing availability."
// Phase 2 (agent activated time picker): "Pick your tour times."
// Phase 3 (done): "All set."
//
// The page polls /api/curated/[token] for the latest phase state, so if a
// lead leaves the page after phase 1 and comes back via the scheduling SMS,
// they automatically land in phase 2.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

// Helpers
function fmt24to12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Generate slots from shift-based availability. Each shift is a real date
// + start + end; we split it into 1-hour slots. Excludes:
//   - slots within 24h (lead time buffer)
//   - dates in blocked_dates
//   - slots already booked by other tours
function generateSlots(availability, bookedSlots) {
  const shifts = Array.isArray(availability?.shifts) ? availability.shifts : [];
  const blockedDates = new Set(availability?.blocked_dates || []);
  const bookedSet = new Set(bookedSlots || []);
  const todayStr = new Date().toISOString().slice(0, 10);
  const minStart = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const slots = [];
  for (const shift of shifts) {
    if (!shift?.date || !shift?.start || !shift?.end) continue;
    if (shift.date < todayStr) continue;
    if (blockedDates.has(shift.date)) continue;
    const [sh, sm] = shift.start.split(':').map(Number);
    const [eh, em] = shift.end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    for (let cur = startMin; cur + 60 <= endMin; cur += 60) {
      const h = Math.floor(cur / 60);
      const m = cur % 60;
      const label = fmt24to12(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      const slotDate = new Date(shift.date + 'T00:00:00');
      slotDate.setHours(h, m, 0, 0);
      if (slotDate < minStart) continue;
      const slotId = `${shift.date}_${label.replace(/[:\s]/g, '')}`;
      if (bookedSet.has(slotId)) continue;
      slots.push({ id: slotId, date: shift.date, time: label });
    }
  }
  return slots.sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  );
}

function fmtSlotDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// Header subtitle defaults to "your hand-picked rentals" (the most common
// landing) but callers can pass a context-specific subtitle so the page
// title matches what the user is actually doing — reschedule, confirmation,
// time-picking, etc. Without this, the page header always read "your
// hand-picked rentals" even on the reschedule-a-tour and tour-confirmed
// screens, which felt off.
const Header = ({ firstName, subtitle }) => (
  <header className="bg-white border-b border-slate-200 px-5 md:px-8 py-4 sticky top-0 z-20">
    <div className="max-w-3xl mx-auto">
      <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--brand-gold)' }}>
        Rentals Philly
      </div>
      <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
        Hi {firstName} — {subtitle || 'your hand-picked rentals'}
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
  // Sync in-flight locks for both phases. React's setSubmittingN is async,
  // so a fast double-tap on the submit button (especially on mobile where
  // there's no visual click feedback delay) can pass through `disabled`
  // and fire the POST twice. Phase 2 double-fire = duplicate tour rows,
  // which corrupts Morgan's calendar. The ref locks close that window
  // synchronously.
  const submit1InFlightRef = useRef(false);
  const submit2InFlightRef = useRef(false);
  const submitRescheduleInFlightRef = useRef(false);

  // Inline notice for transient validation / error feedback. Replaces
  // window.alert() calls which look broken on a polished public-facing
  // booking page and block the whole tab until dismissed. Auto-fades
  // after 4 seconds. setNotice('text') to show, setNotice(null) to clear.
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  // Reusable notice banner element — render this wherever the page needs
  // to surface validation or error messages.
  const noticeBanner = notice ? (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md mx-auto px-4 py-2.5 rounded-xl shadow-lg text-sm flex items-center gap-2 ${notice.kind === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
      <span>{notice.message || notice}</span>
    </div>
  ) : null;
  // Which address card is currently expanded in the time picker. null means
  // "auto" — the first un-picked address expands itself. Used to collapse
  // picked addresses to a one-line summary so the lead doesn't scroll past
  // identical slot grids for each property.
  const [expandedAddr, setExpandedAddr] = useState(null);

  // Reschedule mode state. When ?reschedule=TOUR_ID is in the URL we render
  // a dedicated reschedule UI that overrides the normal phase flow.
  const [rescheduleTourId, setRescheduleTourId] = useState(null);
  const [reschedulePick, setReschedulePick] = useState(null); // { date, time }
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleDone, setRescheduleDone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('reschedule') || params.get('tour');
    if (t) setRescheduleTourId(t);
  }, []);

  const loadData = () => {
    if (!token) return;
    const url = rescheduleTourId
      ? `/api/curated/${token}?tour=${encodeURIComponent(rescheduleTourId)}`
      : `/api/curated/${token}`;
    fetch(url)
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
  }, [token, rescheduleTourId]);

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
      <main className="min-h-screen flex items-center justify-center px-6 bg-slate-50">
        <div className="max-w-md w-full text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-4" style={{ color: 'var(--brand-gold)' }}>
            Rentals Philly
          </div>
          <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Link not found</h1>
          <p className="text-slate-600 text-sm mb-6 leading-relaxed">
            This link may have expired or been replaced. If you&apos;re looking for your personalized rentals page, your agent will send a fresh one — or you can start a new search.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <a
              href="/"
              className="px-5 py-3 rounded-full text-white font-medium"
              style={{ backgroundColor: 'var(--brand-gold)' }}
            >
              Start a new search
            </a>
            <a
              href="mailto:morganrentalsphilly@gmail.com"
              className="px-5 py-3 rounded-full bg-slate-100 text-slate-900 font-medium hover:bg-slate-200"
            >
              Email Morgan
            </a>
          </div>
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-400 text-sm bg-slate-50">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
        Loading…
      </main>
    );
  }

  const firstName = data.firstName || 'there';
  const agentLabel = data.agentName && data.agentName !== '[Your name]' ? data.agentName : 'your agent';
  const portalUrl = data.portalUrl;
  const phase = data.phase;
  const selectedAddrs = data.selectedAddresses || [];

  // ============================================================
  // ============================================================
  // RESCHEDULE MODE — overrides the phase flow when ?reschedule=TOUR is set
  // ============================================================
  if (rescheduleTourId && data.rescheduleTour) {
    const tour = data.rescheduleTour;
    const tourAddr = (tour.listings || []).map((l) => l.address).filter(Boolean)[0] || 'your tour';

    const submitReschedule = async () => {
      if (!reschedulePick) {
        setNotice('Pick a new time first.');
        return;
      }
      // Sync guard — double-tap could fire two reschedule POSTs and write
      // duplicate activity rows.
      if (submitRescheduleInFlightRef.current) return;
      submitRescheduleInFlightRef.current = true;
      setRescheduleSubmitting(true);
      try {
        const res = await fetch(`/api/curated/${token}/reschedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tourId: rescheduleTourId,
            slotDate: reschedulePick.date,
            slotTime: reschedulePick.time,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'reschedule failed');
        }
        setRescheduleDone(true);
      } catch (e) {
        setNotice({ message: `Couldn't reschedule: ${e.message}`, kind: 'error' });
      } finally {
        setRescheduleSubmitting(false);
        submitRescheduleInFlightRef.current = false;
      }
    };

    if (rescheduleDone) {
      return (
        <div className="min-h-screen flex flex-col bg-slate-50">
          <Header firstName={firstName} subtitle="your tour is rescheduled" />
          {noticeBanner}
          <main className="flex-1 max-w-xl w-full mx-auto px-5 md:px-8 py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-6 text-2xl">✓</div>
            <h2 className="text-2xl font-semibold text-slate-900 mb-3">Tour rescheduled.</h2>
            <p className="text-slate-600 leading-relaxed">
              We&apos;ve moved your tour to <strong>{fmtSlotDate(reschedulePick.date)} at {reschedulePick.time}</strong>.
              {agentLabel} will confirm with the landlord shortly — watch for a text.
            </p>
          </main>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Header firstName={firstName} subtitle="reschedule your tour" />
        {noticeBanner}
        <main className="flex-1 max-w-3xl w-full mx-auto px-5 md:px-8 py-6 md:py-10 space-y-6 pb-28">
          <div className="rounded-2xl bg-white border border-slate-200 p-5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Reschedule tour</div>
            <div className="font-semibold text-slate-900 mb-1">{tourAddr}</div>
            <div className="text-sm text-slate-600">
              Currently: <span className="text-slate-900 font-medium">{tour.date} at {tour.time}</span>
            </div>
          </div>

          <section>
            <div className="flex items-center gap-3 mb-3">
              <StepNum n={1} />
              <h2 className="text-base font-semibold text-slate-900">Pick a new time</h2>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 p-4">
              {Object.keys(slotsByDate).length === 0 ? (
                <div className="text-sm italic text-slate-400 text-center py-8">
                  No open times in the next 14 days. Text {agentLabel} directly to reschedule.
                </div>
              ) : Object.entries(slotsByDate).map(([date, daySlots]) => (
                <div key={date}>
                  <div className="text-xs font-medium text-slate-700 mb-1.5">{fmtSlotDate(date)}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {daySlots.map((s) => {
                      const isOn = reschedulePick?.date === s.date && reschedulePick?.time === s.time;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setReschedulePick({ date: s.date, time: s.time })}
                          className={`px-3 py-2 rounded-full text-xs font-medium border transition-colors ${
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
        </main>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 md:px-8 py-3.5 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)] z-20">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div className="text-xs md:text-sm text-slate-600">
              {reschedulePick
                ? <>New time: <span className="font-semibold text-slate-900">{fmtSlotDate(reschedulePick.date)} at {reschedulePick.time}</span></>
                : 'Pick a new time above'}
            </div>
            <button
              onClick={submitReschedule}
              disabled={rescheduleSubmitting || !reschedulePick}
              className="px-6 py-2.5 rounded-full text-sm font-semibold text-white disabled:opacity-30 transition-colors"
              style={{ backgroundColor: 'var(--brand-gold)' }}
            >
              {rescheduleSubmitting ? 'Sending…' : 'Confirm new time'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PHASE 1 — pick properties
  // ============================================================
  if (phase === 1) {
    const parsedAddresses = addressesText.split('\n').map(s => s.trim()).filter(Boolean);

    const submit1 = async () => {
      if (parsedAddresses.length === 0) {
        setNotice('Tell us which properties you like — paste addresses from the listings tab, one per line.');
        return;
      }
      if (submit1InFlightRef.current) return;
      submit1InFlightRef.current = true;
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
        setNotice({ message: `Something went wrong: ${e.message}`, kind: 'error' });
      } finally {
        setSubmitting1(false);
        submit1InFlightRef.current = false;
      }
    };

    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Header firstName={firstName} />
        {noticeBanner}
        <main className="flex-1 max-w-3xl w-full mx-auto px-5 md:px-8 py-6 md:py-10 space-y-7 pb-28">
          <div className="rounded-2xl bg-white border border-slate-200 p-5">
            <p className="text-[15px] text-slate-700 leading-relaxed">
              {agentLabel} hand-picked rentals for you. Browse the photos, then tell us which ones interest
              you. We&apos;ll check availability and send you a scheduling link with open times.
            </p>
          </div>

          <section>
            <div className="flex items-center gap-3 mb-3">
              <StepNum n={1} />
              <h2 className="text-base font-semibold text-slate-900">Browse your listings</h2>
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
                <div className="text-sm font-semibold text-slate-900 mb-1">Open your hand-picked listings</div>
                <div className="text-xs text-slate-600">Opens in a new tab — full photo galleries &amp; details</div>
              </a>
            ) : (
              <div className="rounded-2xl p-5 border-2 border-dashed border-slate-300 text-center text-sm text-slate-500">
                Your agent will send your listing link shortly.
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
              Paste or type addresses from the listings tab — one per line. Anything that identifies
              the place works (full address, just the street, or even &quot;the 4BR on Pine&quot;).
            </p>
            <textarea
              value={addressesText}
              onChange={(e) => setAddressesText(e.target.value)}
              rows={5}
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck="false"
              enterKeyHint="enter"
              placeholder={`1420 Pine St #3B\n234 N 3rd St\n876 S 4th St`}
              className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-base focus:outline-none focus:border-slate-900 resize-y leading-relaxed"
              style={{ fontSize: 16 }}
            />
            {/* Live preview chips — confirm to the lead exactly what they've
                entered so they aren't guessing whether a line is blank or
                whether their last paste landed clean. Much friendlier than
                a silent counter. */}
            {parsedAddresses.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {parsedAddresses.map((addr, i) => (
                  <span key={`${addr}-${i}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-slate-900 border" style={{ backgroundColor: 'var(--brand-gold-soft)', borderColor: 'var(--brand-gold)' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--brand-gold)' }} />
                    {addr}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[11px] text-slate-500 mt-2 text-right">
              {parsedAddresses.length === 0
                ? 'Add at least one to continue'
                : `${parsedAddresses.length} ${parsedAddresses.length === 1 ? 'property' : 'properties'} so far`}
            </div>
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
              // 16px font prevents iOS Safari from auto-zooming on focus,
              // which jumps the layout + ruins the visual rhythm. Required on
              // every customer-facing input.
              style={{ fontSize: 16 }}
              className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:border-slate-400 resize-none bg-white"
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
        <Header firstName={firstName} subtitle="we got your picks" />
        {noticeBanner}
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
        setNotice('Pick a time for every property.');
        return;
      }
      // Sync re-entry guard. Phase 2 creates tour rows in the DB, so a
      // double-tap that fires the POST twice would create duplicate tours.
      if (submit2InFlightRef.current) return;
      submit2InFlightRef.current = true;
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
        setNotice({ message: `Something went wrong: ${e.message}`, kind: 'error' });
      } finally {
        setSubmitting2(false);
        submit2InFlightRef.current = false;
      }
    };

    // Index of the first address that doesn't yet have a pick. We auto-
    // expand this card so the lead is always looking at the one they need
    // to act on. Tapping "Change" on a picked card overrides this to show
    // that card's picker again.
    const firstUnpickedIdx = selectedAddrs.findIndex(
      (a) => !picksByAddr[a]?.slotDate || !picksByAddr[a]?.slotTime
    );
    const pickedCount = selectedAddrs.filter(
      (a) => picksByAddr[a]?.slotDate && picksByAddr[a]?.slotTime
    ).length;
    const progressPct = selectedAddrs.length === 0
      ? 0
      : Math.round((pickedCount / selectedAddrs.length) * 100);

    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Header firstName={firstName} subtitle="pick your tour times" />
        {noticeBanner}

        {/* Sticky progress strip — shows the lead exactly how close they are
            to done so they don't lose track on a long phone scroll. */}
        <div className="sticky top-[73px] z-10 bg-white border-b border-slate-200 px-5 md:px-8 py-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between text-xs md:text-sm mb-1.5">
              <div className="font-semibold text-slate-900">
                {pickedCount} of {selectedAddrs.length} times picked
              </div>
              <div className="text-slate-500">
                {pickedCount === selectedAddrs.length ? 'All set — confirm below' : 'Keep going'}
              </div>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${progressPct}%`, backgroundColor: 'var(--brand-gold)' }}
              />
            </div>
          </div>
        </div>

        <main className="flex-1 max-w-3xl w-full mx-auto px-5 md:px-8 py-6 md:py-10 space-y-4 pb-28">
          <div className="rounded-2xl bg-white border border-slate-200 p-5">
            <p className="text-[15px] text-slate-700 leading-relaxed">
              Great news — {agentLabel} has confirmed availability. Pick a time that works for each property below.
            </p>
          </div>

          {selectedAddrs.map((addr, idx) => {
            const pick = picksByAddr[addr];
            const isPicked = !!(pick?.slotDate && pick?.slotTime);
            // Expanded when: (a) the user explicitly toggled it open via the
            // Change button, OR (b) it's the next un-picked address. Picked
            // cards collapse to a one-line summary by default so the lead
            // isn't scrolling past identical slot grids 3+ times.
            const expanded = expandedAddr === addr || (!isPicked && idx === firstUnpickedIdx && expandedAddr == null);
            return (
              <section key={addr} className={`rounded-2xl bg-white border-2 ${isPicked && !expanded ? 'border-emerald-200' : 'border-slate-200'} overflow-hidden transition-colors`}>
                <button
                  type="button"
                  onClick={() => setExpandedAddr(expanded ? null : addr)}
                  className="w-full text-left p-4 md:p-5 flex items-center gap-3 hover:bg-slate-50/50"
                >
                  <StepNum n={idx + 1} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 text-base truncate">{addr}</div>
                    {isPicked && !expanded && (
                      <div className="text-sm text-emerald-700 mt-0.5">
                        ✓ {fmtSlotDate(pick.slotDate)} at {pick.slotTime}
                      </div>
                    )}
                    {!isPicked && !expanded && (
                      <div className="text-sm text-slate-500 mt-0.5">Tap to pick a time</div>
                    )}
                  </div>
                  {isPicked && !expanded && (
                    <span className="text-xs font-semibold text-slate-600 underline shrink-0">Change</span>
                  )}
                </button>
                {expanded && (
                  <div className="px-4 md:px-5 pb-4 md:pb-5 -mt-1">
                    {isPicked && (
                      <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 inline-block">
                        ✓ {fmtSlotDate(pick.slotDate)} at {pick.slotTime}
                      </div>
                    )}
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
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
                                  onClick={() => {
                                    pickFor(addr, s);
                                    // After picking, collapse this card and let
                                    // the next un-picked one auto-expand via
                                    // firstUnpickedIdx. If the lead just picked
                                    // the last address, collapse to summary so
                                    // the Confirm CTA at the bottom is visible.
                                    setExpandedAddr(null);
                                  }}
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
                  </div>
                )}
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
              style={{ fontSize: 16 }}
              className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:border-slate-400 resize-none bg-white"
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
  // PHASE 3 — all done. Show the booked tours with .ics download +
  // save-contact card so the lead has everything in their phone.
  // ============================================================
  const pickedTimes = Array.isArray(data.pickedTimes) ? data.pickedTimes : [];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header firstName={firstName} subtitle="your tour is booked" />
      {noticeBanner}
      <main className="flex-1 max-w-2xl w-full mx-auto px-5 md:px-8 py-8 md:py-12 space-y-6">
        {/* Hero confirmation */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-2">You&apos;re booked, {firstName}.</h2>
          <p className="text-slate-600 max-w-md mx-auto">
            {agentLabel} will confirm and send calendar invites shortly. Add the tours to your phone now so you don&apos;t forget.
          </p>
        </div>

        {/* Tours card */}
        {pickedTimes.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Your {pickedTimes.length} {pickedTimes.length === 1 ? 'tour' : 'tours'}
              </div>
              {pickedTimes.length > 1 && (
                <button
                  onClick={() => downloadAllTours(pickedTimes, agentLabel)}
                  className="text-xs font-medium px-3 py-1 rounded-full inline-flex items-center gap-1.5 transition-colors hover:bg-slate-50"
                  style={{ color: 'var(--brand-gold)', borderColor: 'var(--brand-gold)', borderWidth: 1, borderStyle: 'solid' }}
                >
                  ↓ Add all to calendar
                </button>
              )}
            </div>
            {pickedTimes.map((p, i) => (
              <div key={i} className={`px-5 py-4 ${i !== 0 ? 'border-t border-slate-100' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{p.address}</div>
                    <div className="text-sm text-slate-500 mt-0.5">{fmtSlotDate(p.slotDate)} · {p.slotTime}</div>
                  </div>
                  <button
                    onClick={() => downloadIcsForPick(p, agentLabel)}
                    className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 inline-flex items-center gap-1"
                  >
                    ↓ .ics
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Save agent contact card */}
        {(data.agentName || data.agentPhone) && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
              style={{ backgroundColor: 'var(--brand-gold)' }}
            >
              {(data.agentName || 'M').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-900">{data.agentName || 'Your agent'}</div>
              <div className="text-sm text-slate-500">Rentals Philly</div>
              {data.agentPhone && <div className="text-xs text-slate-400 mt-0.5">{data.agentPhone}</div>}
            </div>
            <button
              onClick={() => downloadVcard(data.agentName, data.agentPhone)}
              className="shrink-0 text-xs font-medium px-3 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
            >
              Save contact
            </button>
          </div>
        )}

        {/* What happens next */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">What happens next</div>
          <ol className="space-y-3 text-sm text-slate-700">
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--brand-gold)' }}>1</span>
              {agentLabel} confirms times with each landlord (usually within a few hours).
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--brand-gold)' }}>2</span>
              You&apos;ll get a text confirming each tour with the exact address + meeting point.
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--brand-gold)' }}>3</span>
              We&apos;ll text reminders 24 hours and 1 hour before each tour.
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--brand-gold)' }}>4</span>
              Show up. Tour. Pick your favorite. We&apos;ll handle the rest.
            </li>
          </ol>
        </div>

        <div className="text-center text-xs text-slate-400 pb-6">
          Need to change something? Text {data.agentPhone || agentLabel}.
        </div>
      </main>
    </div>
  );
}

// ---- helpers used only on this confirmation page ----
function pad(n) { return String(n).padStart(2, '0'); }
function icsDate(d) {
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
    'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
}
function parsePickStart(p) {
  // p = { address, slotDate (YYYY-MM-DD), slotTime ("5:00 PM") }
  if (!p?.slotDate || !p?.slotTime) return null;
  const [time, ampm] = p.slotTime.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const d = new Date(p.slotDate + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  return d;
}
function downloadIcsForPick(p, agentLabel) {
  const start = parsePickStart(p);
  if (!start) return;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rentals Philly//EN',
    'BEGIN:VEVENT',
    `UID:${p.slotDate}-${p.slotTime}-${(p.address || '').slice(0,20)}@rentalsphilly.com`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:Tour: ${p.address}`,
    `LOCATION:${p.address}`,
    `DESCRIPTION:Tour scheduled by ${agentLabel} at Rentals Philly. Reply to the confirmation text for changes.`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tour-${p.slotDate}.ics`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadAllTours(picks, agentLabel) {
  const events = picks.map((p) => {
    const start = parsePickStart(p);
    if (!start) return '';
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return [
      'BEGIN:VEVENT',
      `UID:${p.slotDate}-${p.slotTime}-${(p.address || '').slice(0,20)}@rentalsphilly.com`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:Tour: ${p.address}`,
      `LOCATION:${p.address}`,
      `DESCRIPTION:Tour scheduled by ${agentLabel} at Rentals Philly.`,
      'END:VEVENT',
    ].join('\r\n');
  }).filter(Boolean).join('\r\n');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rentals Philly//EN', events, 'END:VCALENDAR'].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rentalsphilly-tours.ics`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadVcard(name, phone) {
  const vcard = [
    'BEGIN:VCARD', 'VERSION:3.0',
    `FN:${name || 'Rentals Philly'}`,
    `ORG:Rentals Philly`,
    phone ? `TEL;TYPE=CELL,VOICE:${phone}` : '',
    'END:VCARD',
  ].filter(Boolean).join('\r\n');
  const blob = new Blob([vcard], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(name || 'rentalsphilly').replace(/\s+/g, '-').toLowerCase()}.vcf`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
