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
import { sendEmail } from '@/lib/email.server';

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
    //
    // CRITICAL: the URL we validate against MUST match the URL Twilio
    // actually called byte-for-byte. The previous version built the URL
    // from NEXT_PUBLIC_APP_URL, which is fragile — if the env var is the
    // .vercel.app URL but Twilio was configured with a custom domain (or
    // vice versa), the signature never matches and every single inbound
    // returns 403. Silent failure mode that's brutal to debug.
    //
    // Reconstruct the URL from the incoming request headers instead.
    // Vercel sets x-forwarded-proto + host, and request.url gives us the
    // path. We also fall back to the env-built URL so this still works if
    // headers are stripped for any reason.
    if (process.env.TWILIO_SKIP_SIGNATURE !== 'true') {
      const token = process.env.TWILIO_AUTH_TOKEN;
      const signature = request.headers.get('x-twilio-signature') || '';
      const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
      const host = request.headers.get('host') || '';
      const requestUrl = host
        ? `${forwardedProto}://${host}/api/twilio/inbound`
        : null;
      const envUrl =
        (process.env.NEXT_PUBLIC_APP_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')) +
        '/api/twilio/inbound';
      // Try the request-reconstructed URL first (correct in 99% of cases),
      // then fall back to env-derived. If EITHER matches, we accept.
      const candidates = [requestUrl, envUrl].filter(Boolean);
      let ok = false;
      let lastTriedUrl = '';
      for (const url of candidates) {
        lastTriedUrl = url;
        if (token && twilio.validateRequest(token, signature, url, params)) {
          ok = true;
          break;
        }
      }
      if (!ok) {
        console.warn('[twilio inbound] signature verification failed', {
          tried: candidates,
          gotSignature: signature.slice(0, 12) + '…',
          hasToken: !!token,
        });
        return new NextResponse('Forbidden', { status: 403 });
      }
      // Helpful breadcrumb in production logs so we know which URL matched.
      console.log('[twilio inbound] signature OK', { matchedUrl: lastTriedUrl });
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
    // Match lead by phone, robustly across ALL formats it might be stored in:
    //   +14842641230, 14842641230, 4842641230, (484) 264-1230,
    //   484-264-1230, 484.264.1230, +1 (484) 264-1230, etc.
    //
    // Strategy: build a LIKE pattern that requires the 10 digits to appear in
    // order, but allows any characters between them. This matches every
    // reasonable phone format without us having to enumerate them.
    //
    //   digits 4842641230 → pattern %4%8%4%2%6%4%1%2%3%0%
    //
    // We FIRST try fast exact-equality against the common formats (E.164,
    // 10-digit, pretty) since they cover 99% of cases without a LIKE scan.
    // Only fall back to LIKE on miss.
    let lead = null;
    const digits = from.replace(/^\+1/, '');
    const last10 = digits.slice(-10);
    const e164 = `+1${last10}`;
    const pretty = `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
    for (const candidate of [from, e164, last10, pretty]) {
      if (lead) break;
      const { data } = await db
        .from('leads')
        .select('id, full_name, phone, opted_out, created_at')
        .eq('phone', candidate)
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data[0]) lead = data[0];
    }
    if (!lead && last10.length === 10) {
      // Fallback: LIKE pattern that matches the 10 digits in order with
      // arbitrary separators between them. Catches dashes, dots, spaces,
      // mixed punctuation — any format we didn't pre-enumerate.
      const likePattern = '%' + last10.split('').join('%') + '%';
      const { data } = await db
        .from('leads')
        .select('id, full_name, phone, opted_out, created_at')
        .like('phone', likePattern)
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data[0]) lead = data[0];
    }
    if (lead) {
      console.log('[twilio inbound] matched lead', { from, leadId: lead.id, storedPhone: lead.phone });
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
    //
    // CRITICAL: messages.id has a NOT NULL constraint without a default. We
    // must generate the id client-side. (The client codebase already does
    // this for outbound — `m_${Date.now()}_${random}`. The webhook never
    // did, which is why every inbound was silently failing the insert.)
    //
    // Supabase `.insert()` does NOT throw on error — it returns
    // an { error } object. Always log the error so failures surface in
    // Vercel logs instead of silently dropping messages.
    const messageId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const messageRow = {
      id: messageId,
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
    };
    const { error: insertErr } = await db.from('messages').insert(messageRow);
    if (insertErr) {
      console.error('[twilio inbound] message INSERT failed', {
        error: insertErr.message,
        code: insertErr.code,
        details: insertErr.details,
        hint: insertErr.hint,
        leadId: lead.id,
      });
      // Try the minimal row shape (no optional columns) in case a column
      // from a later migration is missing on the schema.
      const minimalRow = {
        id: messageId,
        lead_id: lead.id,
        channel: 'sms',
        direction: 'inbound',
        status: 'received',
        to: to,
        via: 'twilio',
        body,
      };
      const { error: retryErr } = await db.from('messages').insert(minimalRow);
      if (retryErr) {
        console.error('[twilio inbound] minimal retry ALSO failed — message LOST', {
          error: retryErr.message,
          code: retryErr.code,
          details: retryErr.details,
          hint: retryErr.hint,
        });
      } else {
        console.warn('[twilio inbound] saved via minimal-row fallback (column from migration missing)');
      }
    } else {
      console.log('[twilio inbound] message stored', { messageId, leadId: lead.id, sid: messageSid });
    }

    // 5. AGENT NOTIFICATION — email Morgan immediately so she never misses
    // an inbound text just because her browser isn't open. This is the
    // single most important "I'm running a one-person rental advisory"
    // safety net: a lead replies at 9pm, she's on her phone away from
    // the laptop, and the message would otherwise sit invisible until
    // she next opens the CRM. The email gives her:
    //   - the lead's name + phone
    //   - the message preview
    //   - a deep-link to open the lead in the CRM
    //
    // Gated by settings.notifications.inboundEmail (default on). Skipped
    // for STOP / HELP / START since Twilio's auto-reply covers those and
    // Morgan doesn't need an email per opt-out.
    const isComplianceKeyword = ['stop', 'start', 'help'].includes(classifyKeyword(body) || '');
    if (!isComplianceKeyword) {
      try {
        const { data: settingsRow } = await db.from('settings').select('*').eq('id', 1).single();
        const inboundEmailOn = settingsRow?.notifications?.inboundEmail !== false;
        const agentEmail = settingsRow?.agent_email || settingsRow?.agentEmail || 'morganrentalsphilly@gmail.com';
        if (inboundEmailOn && agentEmail) {
          const appBase = process.env.NEXT_PUBLIC_APP_URL || 'https://rentalsphilly.com';
          const leadUrl = `${appBase}/#admin?lead=${encodeURIComponent(lead.id)}`;
          const inboxUrl = `${appBase}/#admin?tab=inbox`;
          const leadName = lead.full_name || `${from}`;
          const preview = body.slice(0, 200);
          await sendEmail({
            // Don't attach this email to the lead — it'd clutter their
            // message history with our internal alerts. Use a passed `to`
            // override; the wrapper handles agent-only sends without
            // touching the lead's thread.
            leadId: lead.id,
            to: agentEmail,
            subject: `📱 New text from ${leadName}: ${preview.slice(0, 60)}${preview.length > 60 ? '…' : ''}`,
            body:
              `${leadName} just texted you.\n\n` +
              `> ${preview}\n\n` +
              `Phone: ${from}\n` +
              `Reply in the inbox: ${inboxUrl}\n` +
              `Open the lead: ${leadUrl}\n\n` +
              `— Rentals Philly\n` +
              `(You're getting this because Inbound SMS notifications are on in Settings → Notifications. Turn off there if you prefer browser-only alerts.)`,
            kind: 'agent_inbound_alert',
            idempotencyKey: `inbound-alert-${messageId}`,
            automated: true,
            internal: true,  // don't show in lead's thread
          });
        }
      } catch (err) {
        // Don't fail the webhook if the alert email errors — message is
        // already stored, we just won't ping Morgan this time.
        console.warn('[twilio inbound] agent-notification email failed', { error: err?.message });
      }
    }

    // 6. Handle compliance keywords.
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
