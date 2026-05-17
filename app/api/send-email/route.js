// Thin HTTP wrapper around lib/email.server.js.
//
// Accepts either:
//   { leadId, subject, body, kind?, idempotencyKey?, automated?, to? }
// OR (legacy):
//   { to, subject, body }
//
// Legacy calls send the email but don't get logged to messages (no leadId
// to attach to). New callers should always pass leadId so the email shows
// in the lead's inbox.

import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email.server';

export async function POST(request) {
  try {
    const payload = await request.json();
    const { leadId, subject, body, kind, idempotencyKey, automated, to } = payload || {};

    if (!subject || !body) {
      return NextResponse.json(
        { error: 'Missing subject or body' },
        { status: 400 }
      );
    }
    if (!leadId && !to) {
      return NextResponse.json(
        { error: 'Missing leadId or to' },
        { status: 400 }
      );
    }

    const result = await sendEmail({
      leadId, subject, body, to, kind, idempotencyKey, automated,
    });

    if (!result.ok) {
      const status =
        result.error === 'lead_not_found' ? 404 :
        result.error === 'missing_to' ? 422 :
        500;
      console.error('[api/send-email — NOT OK]', { status, result });
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/send-email — UNCAUGHT]', err);
    return NextResponse.json(
      { error: err.message, stack: err.stack?.split('\n').slice(0, 5) },
      { status: 500 }
    );
  }
}
