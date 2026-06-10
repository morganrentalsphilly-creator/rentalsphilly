// /download — post-purchase delivery. Verifies the Stripe session server-side,
// then lists download links gated by /api/files/[name].

import { retrieveCheckoutSession } from '@/lib/stripe.server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Your Downloads — Rentals Philly',
  robots: { index: false },
};

const GOLD = '#b58e54';
const GOLD_DARK = '#9a7843';

const PACKAGE_FILES = [
  '0-START-HERE.pdf',
  '1-Renter-Resume-Template.docx',
  '2-Reference-Sheet-Template.docx',
  '3-Application-Checklist-Fee-Tracker.pdf',
  '4-Explanation-Letters.docx',
  '5-Cosigner-Request-Kit.docx',
  '6-Landlord-Outreach-Scripts.pdf',
  '7-Income-Documentation-Guide.pdf',
  '8-What-Landlords-Actually-Check.pdf',
];

const EXTRAS = {
  voucher_guide: ['9-Philly-Voucher-Navigation-Guide.pdf'],
  get_approved_kit: ['9-Philly-Voucher-Navigation-Guide.pdf', '10-Second-Chance-Playbook.pdf'],
};

const PRODUCT_NAMES = {
  application_kit: 'The Application Kit',
  approval_package: 'The Approval Package',
  get_approved_kit: 'The Get Approved Kit',
  voucher_guide: 'The Voucher Navigation Guide',
};

// Human-friendly labels for the file list
function label(f) {
  return f
    .replace(/\.(pdf|docx)$/, '')
    .replace(/^\d+-/, '')
    .replace(/-/g, ' ');
}

export default async function DownloadPage({ searchParams }) {
  const { session_id } = await searchParams;

  const session = await retrieveCheckoutSession(session_id);
  const paid = session?.payment_status === 'paid';
  const product = session?.metadata?.product || 'approval_package';

  if (!paid) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <div className="text-3xl">⏳</div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">We couldn&apos;t verify that purchase yet.</h1>
          <p className="mt-3 text-slate-600">
            If you just paid, give it a few seconds and refresh this page.
            Otherwise, use the link on your email receipt — or reply to the
            receipt and a real person will sort it out fast.
          </p>
        </div>
      </main>
    );
  }

  let files;
  if (product === 'application_kit') files = PACKAGE_FILES.slice(1, 4);
  else if (product === 'voucher_guide') files = EXTRAS.voucher_guide;
  else files = [...PACKAGE_FILES, ...(EXTRAS[product] || [])];

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-lg px-4 py-10 md:py-14">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${GOLD}, ${GOLD_DARK})` }} />
          <div className="p-6 md:p-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs">✓</span>
              Payment confirmed
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.02em] text-slate-900">You&apos;re in.</h1>
            <p className="mt-2 text-slate-600">
              {PRODUCT_NAMES[product] || 'Your toolkit'} is ready. This page is also
              linked from your email receipt, so you can come back anytime.
            </p>

            {files.includes('0-START-HERE.pdf') && (
              <div className="mt-5 rounded-xl p-4" style={{ backgroundColor: '#FAF5EC', border: `2px solid ${GOLD}` }}>
                <div className="text-sm font-bold" style={{ color: GOLD_DARK }}>
                  DO THIS FIRST
                </div>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                  Open <strong>START HERE</strong> — it has your 7-day plan and
                  tells you exactly which document to use when.
                </p>
              </div>
            )}

            <ul className="mt-6 space-y-2.5">
              {files.map((f, i) => (
                <li key={f}>
                  <a
                    href={`/api/files/${encodeURIComponent(f)}?session_id=${encodeURIComponent(session_id)}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition-colors hover:border-slate-400 hover:bg-slate-50"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                      style={{ background: i === 0 && f.startsWith('0') ? `linear-gradient(180deg, ${GOLD}, ${GOLD_DARK})` : '#0f172a' }}
                    >
                      {f.endsWith('.pdf') ? 'PDF' : 'DOC'}
                    </span>
                    <span className="font-medium text-slate-900">{label(f)}</span>
                    <span className="ml-auto text-slate-400">⬇</span>
                  </a>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-sm leading-relaxed text-slate-500">
              The .docx files are templates — open them in Word, Google Docs, or
              Pages and fill in your details. Trouble downloading? Reply to your
              receipt email and we&apos;ll send everything directly.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
