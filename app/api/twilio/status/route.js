// Twilio delivery status callback.
//
// Configured automatically by lib/sms.server.js (statusCallback on each
// outbound message). Twilio POSTs here at every state transition:
// queued → sent → delivered (or → failed / undelivered).
//
// We update the corresponding messages row by twilio_sid.

import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request) {
  try {
    const formText = await request.text();
    const params = Object.fromEntries(new URLSearchParams(formText));

    // CRITICAL: same URL-reconstruction logic as the inbound webhook (#178).
    // The validation URL MUST match the URL Twilio actually called. Building
    // it from NEXT_PUBLIC_APP_URL alone is fragile: if Twilio is configured
    // with a different hostname (e.g. custom domain vs. vercel.app), every
    // status callback silently 403s and delivery state stays stuck at
    // 'queued' forever in our DB.
    //
    // Strategy: try the request-reconstructed URL first (correct in 99% of
    // cases), fall back to env-derived. Accept on either match.
    if (process.env.TWILIO_SKIP_SIGNATURE !== 'true') {
      const token = process.env.TWILIO_AUTH_TOKEN;
      const signature = request.headers.get('x-twilio-signature') || '';
      const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
      const host = request.headers.get('host') || '';
      const requestUrl = host ? `${forwardedProto}://${host}/api/twilio/status` : null;
      const envUrl =
        (process.env.NEXT_PUBLIC_APP_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')) +
        '/api/twilio/status';
      const candidates = [requestUrl, envUrl].filter(Boolean);
      let ok = false;
      for (const url of candidates) {
        if (token && twilio.validateRequest(token, signature, url, params)) {
          ok = true;
          break;
        }
      }
      if (!ok) {
        console.warn('[twilio status] signature verification failed', {
          tried: candidates,
          gotSignature: signature.slice(0, 12) + '…',
          hasToken: !!token,
        });
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    const sid = params.MessageSid;
    const status = params.MessageStatus; // queued | sending | sent | delivered | failed | undelivered
    const errorCode = params.ErrorCode || null;

    if (!sid) return NextResponse.json({ ok: true });

    const update = {
      delivery_status: status || 'unknown',
    };
    if (errorCode) update.error_code = errorCode;
    if (status === 'delivered') update.delivered_at = new Date().toISOString();

    const db = supabaseAdmin();
    const { error } = await db
      .from('messages')
      .update(update)
      .eq('twilio_sid', sid);

    if (error) {
      console.error('[twilio status] update failed', { sid, status, errorCode, msg: error.message });
    } else {
      console.log('[twilio status]', { sid, status, errorCode });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[twilio status] error', err);
    // Return 200 so Twilio doesn't retry; we've logged it.
    return NextResponse.json({ ok: true });
  }
}
