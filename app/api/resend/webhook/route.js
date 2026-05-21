// Resend webhook receiver.
//
// Configure in Resend dashboard → Webhooks → New webhook:
//   URL:      https://rentalsphilly.vercel.app/api/resend/webhook
//   Events:   email.delivered, email.opened, email.clicked,
//             email.bounced, email.complained, email.delivery_delayed
//   Secret:   set RESEND_WEBHOOK_SECRET in Vercel env (any string)
//
// We map the Resend event back to a messages row by looking up the
// resend id we stash in messages.twilio_sid as `resend:{id}` when we send
// (see lib/email.server.js).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

// Resend signs each webhook with a header; we verify if the secret is set.
function verifySignature(rawBody, headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // optional
  // Resend uses Svix-style signatures: header `svix-signature` like "v1,base64sig"
  const sigHeader = headers.get('svix-signature') || headers.get('webhook-signature') || '';
  if (!sigHeader) return false;
  // Pull every "v1,SIG" pair and check any matches.
  const sigs = sigHeader.split(' ').map((p) => p.trim()).filter((p) => p.startsWith('v1,')).map((p) => p.slice(3));
  if (sigs.length === 0) return false;
  const id = headers.get('svix-id') || headers.get('webhook-id') || '';
  const ts = headers.get('svix-timestamp') || headers.get('webhook-timestamp') || '';
  const signedContent = `${id}.${ts}.${rawBody}`;
  const expected = crypto.createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(signedContent).digest('base64');
  return sigs.some((s) => crypto.timingSafeEqual(Buffer.from(s, 'base64'), Buffer.from(expected, 'base64')));
}

function statusFromEvent(eventType) {
  switch (eventType) {
    case 'email.sent':              return 'sent';
    case 'email.delivered':         return 'delivered';
    case 'email.opened':            return 'opened';
    case 'email.clicked':           return 'clicked';
    case 'email.bounced':           return 'bounced';
    case 'email.complained':        return 'complained';
    case 'email.delivery_delayed':  return 'delayed';
    case 'email.failed':            return 'failed';
    default:                        return null;
  }
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    if (!verifySignature(rawBody, request.headers)) {
      console.warn('[resend webhook] signature verification failed');
      return new NextResponse('Forbidden', { status: 403 });
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload?.type || payload?.event;
    const emailId = payload?.data?.email_id || payload?.data?.id || payload?.email_id;
    const status = statusFromEvent(eventType);

    if (!emailId || !status) {
      return NextResponse.json({ ok: false, skipped: 'no_id_or_status', eventType });
    }

    const db = supabaseAdmin();
    // We stash the resend id in messages.twilio_sid as `resend:{id}` (re-using
    // the column rather than adding a new one).
    const tag = `resend:${emailId}`;
    const updates = {
      delivery_status: status,
    };
    if (status === 'delivered') updates.delivered_at = new Date().toISOString();
    if (status === 'opened')    updates.opened_at = new Date().toISOString();
    if (status === 'clicked')   updates.clicked_at = new Date().toISOString();

    const { error } = await db.from('messages').update(updates).eq('twilio_sid', tag);
    if (error) {
      // Some installs won't have opened_at/clicked_at — retry without them.
      if (error.code === '42703') {
        const minimal = { delivery_status: status };
        await db.from('messages').update(minimal).eq('twilio_sid', tag);
        return NextResponse.json({ ok: true, status, note: 'opened_at/clicked_at columns missing' });
      }
      console.error('[resend webhook] db update failed', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    console.error('[resend webhook] error', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
