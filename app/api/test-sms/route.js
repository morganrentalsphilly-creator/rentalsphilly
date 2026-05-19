// Direct SMS test endpoint. Bypasses lead requirement so the admin can verify
// Twilio + A2P 10DLC end-to-end without creating a dummy lead.
//
// Body: { to, body? }
//
// Returns { ok, simulated?, sid?, error? }

import { NextResponse } from 'next/server';

const DEFAULT_BODY = 'Rentals Philly test message — if you got this, Twilio + A2P 10DLC are wired up correctly. Reply STOP to opt out.';

export async function POST(request) {
  try {
    const { to, body } = await request.json();
    if (!to) return NextResponse.json({ ok: false, error: 'missing_to' }, { status: 400 });

    const message = (body || DEFAULT_BODY).slice(0, 320);

    if (process.env.ENABLE_REAL_SENDING !== 'true') {
      console.log('[test-sms — SIMULATED]', { to, message });
      return NextResponse.json({ ok: true, simulated: true, to, message });
    }

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return NextResponse.json({ ok: false, error: 'twilio_env_missing' }, { status: 500 });
    }

    const twilio = (await import('twilio')).default(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    const fromOrService = process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER;
    if (!fromOrService) return NextResponse.json({ ok: false, error: 'no_from_or_service' }, { status: 500 });

    const opts = { to, body: message };
    if (fromOrService.startsWith('MG')) opts.messagingServiceSid = fromOrService;
    else opts.from = fromOrService;

    const msg = await twilio.messages.create(opts);
    return NextResponse.json({ ok: true, sid: msg.sid, status: msg.status, to: msg.to });
  } catch (err) {
    console.error('[test-sms] error', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
