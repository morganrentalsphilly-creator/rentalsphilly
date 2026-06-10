// Post-purchase delivery page. Verifies the Stripe session server-side,
// then lists download links gated by /api/files/[name].

import { retrieveCheckoutSession } from '@/lib/stripe.server';

export const dynamic = 'force-dynamic';

const GOLD = '#b58e54';

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

export default async function DownloadPage({ searchParams }) {
  const { session_id } = await searchParams;

  const session = await retrieveCheckoutSession(session_id);
  const paid = session?.payment_status === 'paid';
  const product = session?.metadata?.product || 'approval_package';

  if (!paid) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          Hmm — we couldn&apos;t verify that purchase.
        </h1>
        <p className="mt-4 text-slate-600">
          If you just paid, give it a few seconds and refresh this page.
          Otherwise, use the link in your email receipt — or contact us and
          we&apos;ll sort it out fast.
        </p>
      </main>
    );
  }

  let files;
  if (product === 'application_kit') files = PACKAGE_FILES.slice(1, 4);
  else if (product === 'voucher_guide') files = EXTRAS.voucher_guide;
  else files = [...PACKAGE_FILES, ...(EXTRAS[product] || [])];

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">You&apos;re in. Here&apos;s everything.</h1>
      <p className="mt-3 text-slate-600">
        Download all files now and start with <strong>0-START-HERE</strong> —
        it has your 7-day plan. Keep your email receipt; it links back to this
        page any time.
      </p>
      <ul className="mt-8 space-y-3">
        {files.map((f) => (
          <li key={f}>
            <a
              href={`/api/files/${encodeURIComponent(f)}?session_id=${encodeURIComponent(session_id)}`}
              className="block rounded-lg border px-4 py-3 font-medium text-slate-900 hover:bg-slate-50"
              style={{ borderColor: GOLD }}
            >
              ⬇ {f}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-slate-500">
        Problems downloading? Reply to your receipt email and we&apos;ll send the
        files directly.
      </p>
    </main>
  );
}
