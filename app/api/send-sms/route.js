import twilio from 'twilio';
import { NextResponse } from 'next/server';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function POST(request) {
  try {
    const { to, body } = await request.json();

    if (!to || !body) {
      return NextResponse.json(
        { error: 'Missing to or body' },
        { status: 400 }
      );
    }

    // Kill switch — logged-only mode when real sending is disabled
    if (process.env.ENABLE_REAL_SENDING !== 'true') {
      console.log('[SMS — SIMULATED]', { to, bodyPreview: body.slice(0, 80) });
      return NextResponse.json({ success: true, simulated: true });
    }

    const message = await client.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
      body,
    });

    console.log('[SMS — SENT]', { to, sid: message.sid });
    return NextResponse.json({ success: true, sid: message.sid });
  } catch (err) {
    console.error('[SMS — ERROR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}