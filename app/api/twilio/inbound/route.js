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
      // Unknown number — auto-create a stub lead so the message has a home
      // in the inbox. Without this, inbound SMS from any phone not already
      // on a lead record would be dropped on the floor (the lead_id NOT NULL
      // constraint would either reject the message or, worse, accept it but
      // leave it invisible to the inbox UI which filters by lead).
      //
      // The stub is intentionally minimal: phone-only, stage='new', source
      // tagged so Morgan can filter "Cold SMS" leads. No welcome flow fires
      // (we only fire welcome for intake-form submissions). Morgan sees the
      // new lead in the Today queue + the inbound message in the inbox
      // thread, can decide if it's a real prospect, and either fill in
      // their info or hard-delete.
      const stubId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const stubName = `Unknown (${from})`;
      try {
        const { error: leadErr } = await db.from('leads').insert({
          id: stubId,
          full_name: stubName,
          phone: from,
          stage: 'new',
          bucket: 'GCMS',  // placeholder; Morgan can re-classify after gathering info
          raw: {
            source: 'Cold SMS',
            notes: `Auto-created from inbound SMS on ${new Date().toISOString()}. Body: ${body.slice(0, 200)}`,
            tags: ['Cold SMS'],
          },
        });
        if (leadErr) {
          console.error('[twilio inbound] stub lead create failed', leadErr);
          return twiml();
        }
        lead = { id: stubId, full_name: stubName, phone: from, opted_out: false };
        // Best-effort activity row so the inbox shows what happened.
        try {
          await db.from('activities').insert({
            id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            lead_id: stubId,
            type: 'lead-created',
            message: 'Lead created from incoming SMS',
          });
        } catch {}
        console.log('[twilio inbound] created stub lead for unknown sender', { from, stubId });
      } catch (err) {
        console.error('[twilio inbound] stub lead create threw', err?.message);
        return twiml();
      }
      // Fall through to the normal insert + STOP/HELP handling — `lead` is
      // now set so the rest of the webhook works as if this were a known
      // sender.
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
