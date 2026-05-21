// Custom 404 page. Server-rendered (no client interactivity needed).

import Link from 'next/link';

export const metadata = {
  title: 'Page not found · Rentals Philly',
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-slate-50">
      <div className="max-w-md w-full text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-4" style={{ color: 'var(--brand-gold, #b58e54)' }}>
          Rentals Philly
        </div>
        <div className="text-7xl font-bold text-slate-900 mb-2 tracking-tight">404</div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Page not found</h1>
        <p className="text-slate-600 text-sm mb-6 leading-relaxed">
          We couldn&apos;t find what you&apos;re looking for. The link may have expired or moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            href="/"
            className="px-5 py-3 rounded-full text-white font-medium"
            style={{ backgroundColor: 'var(--brand-gold, #b58e54)' }}
          >
            Start a rental search
          </Link>
          <a
            href="mailto:morganrentalsphilly@gmail.com"
            className="px-5 py-3 rounded-full bg-slate-100 text-slate-900 font-medium hover:bg-slate-200"
          >
            Email Morgan
          </a>
        </div>
      </div>
    </div>
  );
}
