'use client';

// Catch-all React error boundary for the App Router.
// Anything that throws below the root layout is caught here so the user
// never sees a white screen. Logs to the browser console + offers a
// reload, a "back home" link, and a way to copy the error for support.

import { useEffect, useState } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error('[Rentals Philly error boundary]', error);
  }, [error]);

  const detail = [
    error?.message || 'Unknown error',
    error?.digest ? `Digest: ${error.digest}` : null,
  ].filter(Boolean).join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(detail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-slate-50">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-5">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="13"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Something went wrong</h1>
        <p className="text-slate-600 text-sm mb-6 leading-relaxed">
          We ran into a hiccup loading this page. The error has been logged.
          Try reloading — if it keeps happening, copy the details below and text Morgan.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mb-5">
          <button
            onClick={reset}
            className="flex-1 px-5 py-3 rounded-full text-white font-medium"
            style={{ backgroundColor: 'var(--brand-gold, #b58e54)' }}
          >
            Try again
          </button>
          <a
            href="/"
            className="flex-1 px-5 py-3 rounded-full bg-slate-100 text-slate-900 font-medium hover:bg-slate-200"
          >
            Back home
          </a>
        </div>
        <details className="text-left text-[11px] text-slate-500">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Show technical details</summary>
          <pre className="mt-2 p-3 bg-white border border-slate-200 rounded-lg whitespace-pre-wrap break-words text-[10px] font-mono text-slate-700">{detail}</pre>
          <button onClick={copy} className="mt-2 underline text-slate-500 hover:text-slate-900">
            {copied ? 'Copied to clipboard' : 'Copy error details'}
          </button>
        </details>
      </div>
    </div>
  );
}
