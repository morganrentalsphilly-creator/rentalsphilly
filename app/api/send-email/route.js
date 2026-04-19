import { Resend } from 'resend';
import { NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    const { to, subject, body } = await request.json();

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: 'Missing to, subject, or body' },
        { status: 400 }
      );
    }

    // Kill switch — logged-only mode when real sending is disabled
    if (process.env.ENABLE_REAL_SENDING !== 'true') {
      console.log('[EMAIL — SIMULATED]', { to, subject, bodyPreview: body.slice(0, 80) });
      return NextResponse.json({ success: true, simulated: true });
    }

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      subject,
      text: body,
    });

    if (error) {
      console.error('[EMAIL — FAILED]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[EMAIL — SENT]', { to, id: data.id });
    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    console.error('[EMAIL — ERROR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}