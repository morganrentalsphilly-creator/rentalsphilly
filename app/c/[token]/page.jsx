'use client';

// Public lead-facing curated page.
//
// URL: /c/[token]
//
// Layout (single column, scroll):
//   1. Branded header
//   2. BrightMLS portal embedded in iframe (or "Open in new tab" fallback)
//   3. "Which would you like to tour?" — address checkboxes
//   4. "When works for you?" — date+time slot picker
//   5. Optional note for agent
//   6. Submit
//
// Submission creates tour requests in the agent's CRM + notifies the agent.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

// Default available showing windows by day-of-week (local Eastern time).
// Times offered to the lead. Edit these to match your typical tour schedule.
const SLOT_TEMPLATE = {
  0: [],                                                          // Sun
  1: [],                                                          // Mon
  2: ['5:00 PM', '6:00 PM'],                                      // Tue
  3: ['5:00 PM', '6:00 PM'],                                      // Wed
  4: ['5:00 PM', '6:00 PM'],                                      // Thu
  5: ['5:00 PM', '6:00 PM'],                                      // Fri
  6: ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM'], // Sat
};
const DAYS_AHEAD = 14;

function generateSlots() {
  const slots = [];
  const now = new Date();
  const minStart = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour lead time
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    const times = SLOT_TEMPLATE[dow] || [];
    for (const t of times) {
      const [hStr, mStrAmpm] = t.split(':');
      const h12 = parseInt(hStr, 10);
      const ampm = mStrAmpm.slice(-2);
      const m = parseInt(mStrAmpm.slice(0, 2), 10);
      const h24 = ampm === 'PM' && h12 !== 12 ? h12 + 12 : ampm === 'AM' && h12 === 12 ? 0 : h12;
      const slotDate = new Date(d);
      slotDate.setHours(h24, m, 0, 0);
      if (slotDate < minStart) continue;
      slots.push({
        id: `${d.toISOString().slice(0, 10)}_${t.replace(/[:\s]/g, '')}`,
        date: d.toISOString().slice(0, 10),
        time: t,
        ts: slotDate.getTime(),
      });
    }
  }
  return slots;
}

function fmtSlotDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export default function CuratedPage() {
  const params = useParams();
  const token = params?.token;
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [pickedAddrs, setPickedAddrs] = useState(new Set());
  const [pickedSlots, setPickedSlots] = useState(new Set());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/curated/${token}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setData)
      .catch((e) => setLoadError(String(e)));
  }, [token]);

  // 5-second timer to detect X-Frame-Options blocking
  useEffect(() => {
    if (!data?.portalUrl) return;
    const timer = setTimeout(() => {
      if (!iframeLoaded) setIframeBlocked(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [data?.portalUrl, iframeLoaded]);

  const slots = useMemo(() => generateSlots(), []);
  const slotsByDate = useMemo(() => {
    const map = {};
    for (const s of slots) {
      (map[s.date] = map[s.date] || []).push(s);
    }
    return map;
  }, [slots]);

  const toggleAddr = (addr) => {
    setPickedAddrs((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr); else next.add(addr);
      return next;
    });
  };
  const toggleSlot = (slotId) => {
    setPickedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId); else next.add(slotId);
      return next;
    });
  };

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
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-400 text-sm bg-slate-50">Loading your picks…</main>
    );
  }

  const firstName = data.firstName || 'there';
  const agentLabel = data.agentName && data.agentName !== '[Your name]' ? data.agentName : 'your agent';
  const addresses = Array.isArray(data.addresses) && data.addresses.length > 0
    ? data.addresses
    : (data.properties || []).map(p => p.address).filter(Boolean);

  const submit = async () => {
    if (pickedAddrs.size === 0) {
      alert('Pick at least one property you want to tour.');
      return;
    }
    if (pickedSlots.size === 0) {
      alert('Pick at least one time that works for you.');
      return;
    }
    setSubmitting(true);
    try {
      const pickedSlotObjs = slots.filter((s) => pickedSlots.has(s.id));
      // Build one selection per (address × first picked slot) — agent will
      // confirm specific times in the inbox conversation.
      const selections = Array.from(pickedAddrs).map((address, i) => {
        const slot = pickedSlotObjs[i % pickedSlotObjs.length];
        return {
          address,
          slotDate: slot.date,
          slotTime: slot.time,
        };
      });
      const noteForAgent =
        `Lead picked these times: ${pickedSlotObjs.map((s) => `${fmtSlotDate(s.date)} ${s.time}`).join(', ')}` +
        (note.trim() ? ` · Lead note: ${note.trim()}` : '');
      const res = await fetch(`/api/curated/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections, note: noteForAgent }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Submit failed');
      setSubmitted(true);
    } catch (e) {
      alert('Something went wrong: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="max-w-xl mx-auto px-6 py-16 text-center bg-white">
        <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-6 text-2xl">✓</div>
        <h1 className="text-3xl font-semibold text-slate-900 mb-3">Got it, {firstName}.</h1>
        <p className="text-slate-600 leading-relaxed mb-2">
          You requested {pickedAddrs.size} {pickedAddrs.size === 1 ? 'tour' : 'tours'} across {pickedSlots.size} {pickedSlots.size === 1 ? 'time' : 'times'}.
        </p>
        <p className="text-slate-500 text-sm">
          {agentLabel} will confirm specific times and send you a calendar invite shortly. Watch your text + email.
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-5 md:px-8 py-4 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--brand-gold)' }}>Rentals Philly</div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 truncate">
            Hi {firstName} — your hand-picked rentals
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-5 md:px-8 py-6 md:py-10 space-y-8">

        {/* 1. PHOTOS — iframe of BrightMLS portal */}
        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-1">1. Browse the photos</h2>
          <p className="text-sm text-slate-500 mb-3">Scroll through the listings on BrightMLS below. Note the addresses you like, then pick them in step 2.</p>
          <div className="relative h-[500px] md:h-[600px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
            {data.portalUrl ? (
              <>
                <iframe
                  src={data.portalUrl}
                  title="BrightMLS portal"
                  onLoad={() => setIframeLoaded(true)}
                  className="absolute inset-0 w-full h-full border-0"
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                />
                {iframeBlocked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white">
                    <div className="max-w-md text-center p-6">
                      <div className="text-base font-semibold text-slate-900 mb-2">Photos open in a new tab</div>
                      <p className="text-sm text-slate-600 mb-4">
                        Tap below to open BrightMLS with all your listings &amp; photos. Come back here when you&apos;re ready to pick.
                      </p>
                      <a
                        href={data.portalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white"
                        style={{ backgroundColor: 'var(--brand-gold)' }}
                      >
                        Open photos →
                      </a>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
                No portal link configured yet. Your agent will send one shortly.
              </div>
            )}
          </div>
          {data.portalUrl && (
            <div className="mt-2 text-right">
              <a href={data.portalUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline text-slate-500 hover:text-slate-900">
                Open photos in a new tab ↗
              </a>
            </div>
          )}
        </section>

        {/* 2. PICK ADDRESSES */}
        {addresses.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-slate-900 mb-1">
              2. Which would you like to tour?
            </h2>
            <p className="text-sm text-slate-500 mb-3">Check all that interest you. You can pick more than one.</p>
            <div className="space-y-2">
              {addresses.map((addr) => {
                const isOn = pickedAddrs.has(addr);
                return (
                  <label
                    key={addr}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                      isOn ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white hover:border-slate-400'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${isOn ? 'bg-white' : 'border-2 border-slate-300'}`}>
                      {isOn && <span className="text-slate-900 text-sm font-bold">✓</span>}
                    </div>
                    <span className={`text-sm md:text-base font-medium ${isOn ? 'text-white' : 'text-slate-900'}`}>{addr}</span>
                    <input type="checkbox" checked={isOn} onChange={() => toggleAddr(addr)} className="sr-only" />
                  </label>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. PICK TIMES */}
        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-1">
            3. When works for you?
          </h2>
          <p className="text-sm text-slate-500 mb-3">Pick a few times. {agentLabel} will confirm one back.</p>
          <div className="space-y-4">
            {Object.entries(slotsByDate).map(([date, daySlots]) => (
              <div key={date} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900 mb-2.5">{fmtSlotDate(date)}</div>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((s) => {
                    const isOn = pickedSlots.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSlot(s.id)}
                        className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-colors ${
                          isOn ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
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

        {/* 4. OPTIONAL NOTE */}
        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-1">
            4. Anything else? <span className="text-slate-400 font-normal text-sm">(optional)</span>
          </h2>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Questions, must-haves, or constraints…"
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-slate-400 resize-none bg-white"
          />
        </section>

        <div className="h-20" /> {/* footer breathing room above sticky CTA */}
      </main>

      {/* STICKY SUBMIT BAR */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 md:px-8 py-3.5 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)] z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="text-xs md:text-sm">
            <span className="font-semibold text-slate-900">{pickedAddrs.size}</span>
            <span className="text-slate-500"> {pickedAddrs.size === 1 ? 'property' : 'properties'} · </span>
            <span className="font-semibold text-slate-900">{pickedSlots.size}</span>
            <span className="text-slate-500"> {pickedSlots.size === 1 ? 'time' : 'times'}</span>
          </div>
          <button
            onClick={submit}
            disabled={submitting || pickedAddrs.size === 0 || pickedSlots.size === 0}
            className="px-6 py-2.5 rounded-full text-sm font-semibold text-white disabled:opacity-30 transition-colors"
            style={{ backgroundColor: 'var(--brand-gold)' }}
          >
            {submitting ? 'Sending…' : 'Request tours'}
          </button>
        </div>
      </div>
    </div>
  );
}
