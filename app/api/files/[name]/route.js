// Gated product-file delivery: serves files from /private-files only to
// verified, paid Stripe Checkout sessions. Files are NOT in /public — the
// only way to download is with a session_id that Stripe confirms as paid.

import { NextResponse } from 'next/server';
import { retrieveCheckoutSession } from '@/lib/stripe.server';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { name } = await params;
  const sessionId = new URL(request.url).searchParams.get('session_id') || '';

  const session = await retrieveCheckoutSession(sessionId);
  if (!session || session.payment_status !== 'paid') {
    return NextResponse.json({ error: 'Purchase not verified' }, { status: 403 });
  }

  const safe = path.basename(name); // no path traversal
  const filePath = path.join(process.cwd(), 'private-files', safe);
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(safe).toLowerCase();
    const type =
      ext === '.pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return new NextResponse(data, {
      headers: {
        'Content-Type': type,
        'Content-Disposition': `attachment; filename="${safe}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
