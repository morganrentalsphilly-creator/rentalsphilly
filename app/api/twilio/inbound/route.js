// Twilio inbound SMS webhook.
//
// Configure in Twilio Console → Messaging Services → your service → Integration
// → Incoming Messages → Send a webhook to:
//     https://<your-domain>/api/twilio/inbound
// (Method: HTTP POST, content type: application/x-www-form-urlencoded)
//
// If you're using a plain phone number instead of a Messaging Service:
//   Twilio Console → Phone Numbers → your number → Messaging Configuration
//   → A message comes in → Webhook → same URL above.
//
// Security: we verify the X-Twilio-Signature header against TWILIO_AUTH_TOKEN
// so randos on the internet can't fake inbound messages.

import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSms, classifyKeyword, markOptOut, clearOptOut, toE164 } from '@/lib/sms.server';

function twiml(body) {
  // Empty TwiML response = "Twilio, do nothing, we already handled it."
  // If a body is provided, Twilio will reply with it (used for HELP).
  const xml = body
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(body)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function POST(request) {
  try {
    // 1. Read the raw form body (Twilio sends application/x-www-form-urlencoded).
    const formText = await request.text();
    const params = Object.fromEntries(new URLSearchParams(formText));

    // 2. Verify Twilio signature unless explicitly disabled (local dev).
    if (process.env.TWILIO_SKIP_SIGNATURE !== 'true') {
      const token = process.env.TWILIO_AUTH_TOKEN;
      const signature = request.headers.get('x-twilio-signature') || '';
      const url =
        (process.env.NEXT_PUBLIC_APP_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')) +
        '/api/twilio/inbound';
      const ok = token && twilio.validateRequest(token, signature, url, params);
      if (!ok) {
        console.warn('[twilio inbound] signature verification failed', { url });
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    const from = toE164(params.From);
    const to = toE164(params.To);
    const messageSid = params.MessageSid;
    const body = (params.Body || '').toString();

    if (!from || !body) {
      return twiml();
    }

    const db = supabaseAdmin();

    // 2.5. Idempotency: if Twilio is retrying a webhook for the same MessageSid
    //      (happens when our handler is slow or briefly errored), we've already
    //      processed this message. Return immediately to avoid duplicate rows.
    if (messageSid) {
      const { data: existing } = await db
        .from('messages')
        .select('id')
        .eq('twilio_sid', messageSid)
        .eq('direction', 'inbound')
        .maybeSingle();
      if (existing) {
        console.log('[twilio inbound] duplicate webhook ignored', { messageSid });
        return twiml();
      }
    }

    // 3. Find or create the lead by phone.
    //
    // We use `.limit(1)` (not `.maybeSingle()`) because maybeSingle throws if
    // 2+ leads share the phone — which can happen if a lead retries intake
    // under a slightly different name. A throw here would crash the webhook,
    // Twilio would retry-storm us with 500s, and the lead's reply would be
    // silently lost. Ordering by created_at DESC picks the most recent lead
    // when there's ambiguity (typically the right answer for "who texted me").
    let lead = null;
    {
      const { data } = await db
        .from('leads')
        .select('id, full_name, phone, opted_out, created_at')
        .eq('phone', from)
        .order('created_at', { ascending: false })
        .limit(1);
      lead = (data && data[0]) || null;
    }
    if (!lead) {
      // Stored phones may be in legacy formats (10-digit, or `(215) 555-1234`).
      // Try each shape with a separate query — Supabase's `.or()` doesn't like
      // unquoted parens/spaces in values, so we keep it simple.
      const digits = from.replace(/^\+1/, '');
      const pretty = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
      for (const candidate of [digits, pretty]) {
        const { data } = await db
          .from('leads')
          .select('id, full_name, phone, opted_out, created_at')
          .eq('phone', candidate)
          .order('created_at', { ascending: false })
          .limit(1);
        if (data && data[0]) { lead = data[0]; break; }
      }
    }
    if (!lead) {
      // Unknown number — log as an orphan inbound so we can backfill later.
      // We store it as a row with lead_id null. (The leads table FK should allow this;
      // if not, we'll just log to console.)
      try {
        await db.from('messages').insert({
          lead_id: null,
          channel: 'sms',
          direction: 'inbound',
          status: 'received',
          delivery_status: 'received',
          to: to,
          via: 'twilio',
          body,
          kind: 'unknown_sender',
          twilio_sid: messageSid,
        });
      } catch (err) {
        console.warn('[twilio inbound] orphan inbound (lead_id NOT NULL?)', err?.message);
      }
      console.log('[twilio inbound] no matching lead', { from, bodyPreview: body.slice(0, 60) });
      return twiml();
    }

    // 4. Insert the inbound message row.
    await db.from('messages').insert({
      lead_id: lead.id,
      channel: 'sms',
      direction: 'inbound',
      status: 'received',
      delivery_status: 'received',
      to: to,
      via: 'twilio',
      body,
      kind: 'inbound',
      twilio_sid: messageSid,
      automated: false,
    });

    // 5. Handle compliance keywords.
    const keyword = classifyKeyword(body);
    if (keyword === 'stop') {
      await markOptOut(lead.id, from);
      // Twilio also sends its own STOP confirmation. To avoid double-confirming,
      // we let Twilio's default confirmation handle it (return empty TwiML).
      return twiml();
    }
    if (keyword === 'start') {
      await clearOptOut(lead.id);
      // Send a friendly confirmation via our wrapper (so it's logged).
      await sendSms({
        leadId: lead.id,
        kind: 'manual',
        body: `You're back in. We'll keep you posted on new listings and showings. Reply STOP anytime to opt out.`,
      });
      return twiml();
    }
    if (keyword === 'help') {
      return twiml(
        `Rentals Philly: This is the rental showings + listings line for Morgan. ` +
        `Reply STOP to opt out. For help text Morgan directly or email morganrentalsphilly@gmail.com.`
      );
    }

    // 6. Default: nothing to send back, the message is in the inbox now.
    return twiml();
  } catch (err) {
    console.error('[twilio inbound] error', err);
    // Always return 200 + empty TwiML so Twilio doesn't retry storm us.
    return twiml();
  }
}
