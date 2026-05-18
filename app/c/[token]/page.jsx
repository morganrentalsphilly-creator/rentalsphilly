'use client';

// Public lead-facing curated page.
//
// URL: /c/[token]
//
// Layout:
//   - Header with greeting
//   - Embedded BrightMLS portal iframe (lead browses photos here)
//   - Sticky "Reply by text to schedule" CTA + alternate form
//
// The lead's reply lands in the agent's inbox via the existing Twilio
// inbound webhook (no new infra). The optional in-page form provides a
// non-SMS fallback for desktop / users who'd rather type.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function CuratedPage() {
  const params = useParams();
  const token = params?.token;
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formText, setFormText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/curated/${token}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setData)
      .catch((e) => setLoadError(String(e)));
  }, [token]);

  // If the iframe doesn't load within 5 seconds, assume X-Frame-Options blocked it.
  useEffect(() => {
    if (!data?.portalUrl) return;
    const timer = setTimeout(() => {
      if (!iframeLoaded) setIframeBlocked(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [data?.portalUrl, iframeLoaded]);

  if (loadError) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <div className="text-2xl font-semibold text-slate-900 mb-2">Link not found</div>
          <div className="text-slate-500">This link may have expired. Reach out to your agent for a fresh one.</div>
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading your picks…</main>
    );
  }

  const firstName = data.firstName || 'there';
  const agentLabel = data.agentName && data.agentName !== '[Your name]' ? data.agentName : 'your agent';
  const agentPhone = data.agentPhone || '';
  // Format the phone to digits-only for the sms: URI.
  const phoneDigits = String(agentPhone).replace(/\D/g, '');
  const smsBodyPrefill = encodeURIComponent(
    `Hi! It's ${firstName}. I'd like to tour these from the listings you sent:\n\n• \n\nGood times for me: `
  );
  const smsHref = phoneDigits ? `sms:+1${phoneDigits.length === 11 ? phoneDigits.slice(1) : phoneDigits}?&body=${smsBodyPrefill}` : null;

  const submitForm = async () => {
    if (!formText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/curated/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selections: [],
          note: formText,
          via: 'in-page-form',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Submit failed');
      }
      setSubmitted(true);
    } catch (e) {
      alert('Could not send: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="max-w-xl mx-auto px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-6 text-2xl">✓</div>
        <h1 className="text-3xl font-semibold text-slate-900 mb-3">Got it, {firstName}.</h1>
        <p className="text-slate-600 leading-relaxed">
          {agentLabel} will confirm tour times shortly. Watch for a text and email.
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-5 md:px-8 py-4 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Rentals Philly</div>
            <h1 className="text-base md:text-lg font-semibold text-slate-900 truncate">
              Hi {firstName} — your hand-picked rentals
            </h1>
          </div>
          {smsHref && (
            <a
              href={smsHref}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 transition-colors shrink-0"
            >
              💬 Text to schedule
            </a>
          )}
        </div>
      </header>

      {/* Portal iframe (fills remaining space) */}
      <div className="flex-1 relative bg-slate-100">
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
                  <div className="text-lg font-semibold text-slate-900 mb-2">Open your listings in a new tab</div>
                  <p className="text-sm text-slate-600 mb-5">
                    BrightMLS doesn&apos;t allow their portal to be embedded. Tap below to view your hand-picked
                    rentals, then come back here to reply.
                  </p>
                  <a
                    href={data.portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800"
                  >
                    Open BrightMLS portal →
                  </a>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <div className="max-w-md text-center p-6 text-slate-500">
              No portal link configured yet. Your agent will send one shortly.
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom action bar */}
      <div className="bg-white border-t border-slate-200 px-5 md:px-8 py-3 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)] z-20">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 text-sm">Ready to schedule a tour?</div>
            <div className="text-xs text-slate-500 mt-0.5 hidden sm:block">
              Text {agentLabel} with the addresses you want and times that work.
            </div>
          </div>
          {smsHref ? (
            <a
              href={smsHref}
              className="px-4 py-2.5 bg-slate-900 text-white rounded-full text-sm font-semibold inline-flex items-center gap-2 hover:bg-slate-800"
            >
              💬 Text to schedule
            </a>
          ) : null}
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-full text-sm font-medium hover:bg-slate-50"
          >
            Or fill a form
          </button>
        </div>
      </div>

      {/* In-page form modal (fallback for non-SMS users) */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900 text-sm">Request tours</div>
                <div className="text-xs text-slate-500">{agentLabel} will confirm times.</div>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Which addresses & when?
                </label>
                <textarea
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  rows={8}
                  placeholder="e.g.&#10;1420 Pine St — Saturday morning&#10;234 N 3rd St — Tuesday after 5pm&#10;876 S 4th St — anytime weekend"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400 resize-none"
                />
              </div>
              <button
                onClick={submitForm}
                disabled={submitting || !formText.trim()}
                className="w-full py-3 bg-slate-900 text-white rounded-full text-sm font-semibold disabled:opacity-30 hover:bg-slate-800"
              >
                {submitting ? 'Sending…' : 'Send to my agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
