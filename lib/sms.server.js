// ============================================================================
// Server-side SMS wrapper.
//
// This is the ONLY place in the app that talks to Twilio. Every SMS — welcome,
// tour confirmation, manual reply, automation nudge, scheduled reminder, bulk
// blast — flows through `sendSms()` below. That gives us one place to enforce:
//
//   - opt-out (STOP) honored
//   - idempotency (no double-sends on retry / double-click)
//   - message row written atomically with the Twilio call
//   - delivery status callback wired up
//   - kill-switch via ENABLE_REAL_SENDING (simulated mode)
//   - consistent shape returned to callers
//
// NEVER import this from a client component. Import only from /api/* routes.
// ============================================================================

import twilio from 'twilio';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

// ---------- Twilio client (lazy so missing env doesn't crash at import time)
let _client = null;
function client() {
  if (_client) return _client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  }
  _client = twilio(sid, token);
  return _client;
}

// ---------- Helpers
export function toE164(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith('+')) return s.replace(/[^\d+]/g, '');
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function callbackUrl(path) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!base) return undefined; // running locally without ngrok — Twilio just won't callback
  return `${base.replace(/\/$/, '')}${path}`;
}

function appendCompliance(body, kind) {
  // Transactional kinds (legit business response to a user's request) don't
  // need a marketing footer. Promotional / bulk does.
  //
  // What's "transactional"? A direct response to something the lead did:
  // submitted intake, asked for a tour, picked a property, rescheduled, etc.
  // What's "promotional"? Cold blast / drip nudges where the lead didn't
  // explicitly ask for THIS message.
  const transactional = new Set([
    'welcome',                      // response to intake submission
    'tour_confirmation',            // response to tour booking
    'tour_reschedule_confirm',      // response to lead's reschedule action
    'virtual_tour',                 // response to virtual tour request
    'reminder_24hr',                // tied to a booked tour
    'reminder_1hr',                 // tied to a booked tour
    'manual',                       // agent typing in the inbox
    'screening_followup',           // response to screening submission
    'application_followup',         // response to application submission
    'application_link',             // sent after post-tour conversation
  ]);
  if (transactional.has(kind)) return body;
  if (/reply\s+stop/i.test(body)) return body; // already has footer
  return `${body.trimEnd()}\n\nReply STOP to opt out.`;
}

const STOP_WORDS = new Set([
  'stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt-out',
]);
const START_WORDS = new Set(['start', 'yes', 'unstop']);
const HELP_WORDS = new Set(['help', 'info']);

export function classifyKeyword(body) {
  if (!body) return null;
  const norm = body.trim().toLowerCase();
  if (STOP_WORDS.has(norm)) return 'stop';
  if (START_WORDS.has(norm)) return 'start';
  if (HELP_WORDS.has(norm)) return 'help';
  return null;
}

// ---------- The wrapper
//
// sendSms({
//   leadId,           required — uuid of the lead this SMS is to
//   body,             required — message text (compliance footer auto-appended for non-transactional kinds)
//   kind,             required — one of: welcome | tour_confirmation | virtual_tour |
//                                manual | nudge_48hr | nudge_5day | reminder_24hr |
//                                reminder_1hr | blast | screening_followup | application_followup
//   to,               optional — overrides the lead's phone (rare; e.g. test mode)
//   idempotencyKey,   optional — caller supplies; otherwise auto-generated. Same
//                                key + same body = no-op (returns the prior row).
//   automated,        optional — boolean, default true unless kind === 'manual'
//   blastRecipientId, optional — uuid of the sms_blast_recipients row, updated on completion
// }) -> { ok, simulated?, message: <row>, twilioSid?, error? }
//
// On opt-out: returns { ok: false, error: 'opted_out', message: <row with delivery_status='opted_out'> }
// On missing/invalid phone: returns { ok: false, error: 'invalid_phone' }
// On Twilio API failure: returns { ok: false, error: <twilio code or message>, message: <row with status='failed'> }
// On dry-run mode (ENABLE_REAL_SENDING != 'true'): returns { ok: true, simulated: true, message: <row with status='simulated'> }
// ============================================================================

export async function sendSms({
  leadId,
  body,
  kind,
  to,
  idempotencyKey,
  automated,
  blastRecipientId,
}) {
  if (!leadId) return { ok: false, error: 'missing_lead_id' };
  if (!body) return { ok: false, error: 'missing_body' };
  if (!kind) return { ok: false, error: 'missing_kind' };

  const db = supabaseAdmin();
  const isManual = kind === 'manual';
  const isAutomated = typeof automated === 'boolean' ? automated : !isManual;

  // 1. Look up the lead and check opt-out + get phone.
  const { data: lead, error: leadErr } = await db
    .from('leads')
    .select('id, full_name, phone, opted_out')
    .eq('id', leadId)
    .single();
  if (leadErr || !lead) {
    return { ok: false, error: 'lead_not_found' };
  }

  const target = toE164(to || lead.phone);
  if (!target) {
    return { ok: false, error: 'invalid_phone' };
  }

  // 2. Honor opt-out — record the attempt as a row with a clear status,
  //    don't actually call Twilio.
  if (lead.opted_out) {
    const { data: row } = await db
      .from('messages')
      .insert({
        lead_id: lead.id,
        channel: 'sms',
        direction: 'outbound',
        status: 'sent',                 // legacy field — keep populated for the UI
        delivery_status: 'opted_out',
        to: target,
        via: 'twilio',
        body,
        kind,
        automated: isAutomated,
        idempotency_key: idempotencyKey || null,
      })
      .select()
      .single();
    if (blastRecipientId) {
      await db.from('sms_blast_recipients')
        .update({ status: 'opted_out', message_id: row?.id })
        .eq('id', blastRecipientId);
    }
    return { ok: false, error: 'opted_out', message: row };
  }

  // 3. Idempotency — if a row with this key already exists, return it.
  if (idempotencyKey) {
    const { data: existing } = await db
      .from('messages')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) {
      return {
        ok: existing.delivery_status !== 'failed',
        message: existing,
        twilioSid: existing.twilio_sid,
        simulated: existing.delivery_status === 'simulated',
      };
    }
  }

  const finalBody = appendCompliance(body, kind);

  // 4. Pre-insert the message row in 'queued' status so we have an id and
  //    so the row will exist even if Twilio errors before we get to step 6.
  //    Explicit id so we don't depend on a column default — the rest of the
  //    codebase generates ids in this same format.
  const explicitId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const { data: pending, error: pendingErr } = await db
    .from('messages')
    .insert({
      id: explicitId,
      lead_id: lead.id,
      channel: 'sms',
      direction: 'outbound',
      status: 'sent',                   // legacy field — keep populated
      delivery_status: 'queued',
      to: target,
      via: 'twilio',
      body: finalBody,
      kind,
      automated: isAutomated,
      internal: false,
      idempotency_key: idempotencyKey || crypto.randomUUID(),
    })
    .select()
    .single();

  if (pendingErr) {
    console.error('[SMS — PRE-INSERT FAILED]', {
      leadId, kind, errMsg: pendingErr.message, errCode: pendingErr.code,
      errDetails: pendingErr.details, errHint: pendingErr.hint,
    });
  }

  if (pendingErr || !pending) {
    // Probably a unique-violation on idempotency_key from a racing call.
    // Look it up and return it.
    if (idempotencyKey) {
      const { data: existing } = await db
        .from('messages')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (existing) {
        return { ok: true, message: existing, twilioSid: existing.twilio_sid };
      }
    }
    return { ok: false, error: pendingErr?.message || 'insert_failed' };
  }

  // 5. Kill switch — log only, don't actually send.
  if (process.env.ENABLE_REAL_SENDING !== 'true') {
    console.log('[SMS — SIMULATED]', {
      to: target, kind, leadId, bodyPreview: finalBody.slice(0, 80),
    });
    const { data: updated } = await db
      .from('messages')
      .update({ delivery_status: 'simulated', sent_at: new Date().toISOString() })
      .eq('id', pending.id)
      .select()
      .single();
    if (blastRecipientId) {
      await db.from('sms_blast_recipients')
        .update({ status: 'sent', message_id: pending.id, sent_at: new Date().toISOString() })
        .eq('id', blastRecipientId);
    }
    return { ok: true, simulated: true, message: updated || pending };
  }

  // 6. Real send.
  try {
    const params = {
      to: target,
      body: finalBody,
      statusCallback: callbackUrl('/api/twilio/status'),
    };
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      params.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    } else if (process.env.TWILIO_PHONE_NUMBER) {
      params.from = process.env.TWILIO_PHONE_NUMBER;
    } else {
      throw new Error('No TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER set');
    }

    const msg = await client().messages.create(params);
    const { data: updated } = await db
      .from('messages')
      .update({
        twilio_sid: msg.sid,
        delivery_status: msg.status || 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', pending.id)
      .select()
      .single();

    if (blastRecipientId) {
      await db.from('sms_blast_recipients')
        .update({ status: 'sent', message_id: pending.id, sent_at: new Date().toISOString() })
        .eq('id', blastRecipientId);
    }

    return { ok: true, message: updated || pending, twilioSid: msg.sid };
  } catch (err) {
    const errMsg = err?.message || 'twilio_failed';
    const errCode = err?.code ? String(err.code) : null;
    console.error('[SMS — TWILIO ERROR]', { leadId, kind, code: errCode, msg: errMsg });

    const { data: failed } = await db
      .from('messages')
      .update({
        delivery_status: 'failed',
        error_code: errCode,
        error_message: errMsg.slice(0, 500),
      })
      .eq('id', pending.id)
      .select()
      .single();

    if (blastRecipientId) {
      await db.from('sms_blast_recipients')
        .update({ status: 'failed', message_id: pending.id, error: errMsg.slice(0, 500) })
        .eq('id', blastRecipientId);
    }

    return { ok: false, error: errMsg, message: failed || pending };
  }
}

// ---------- Helpers exported for the inbound webhook ------------------------
//
// TCPA-CRITICAL: if these writes silently fail and we keep texting an opted-out
// lead, that's a regulatory violation. Always capture + log the error so we can
// see in production logs that opt-out actually persisted.
export async function markOptOut(leadId, phone) {
  const db = supabaseAdmin();
  const { error } = await db
    .from('leads')
    .update({ opted_out: true, opted_out_at: new Date().toISOString() })
    .eq('id', leadId);
  if (error) {
    console.error('[SMS — OPT-OUT FAILED — TCPA RISK]', { leadId, phone, error: error.message, code: error.code });
    throw new Error(`markOptOut failed: ${error.message}`);
  }
  console.log('[SMS — OPT-OUT]', { leadId, phone });
}

export async function clearOptOut(leadId) {
  const db = supabaseAdmin();
  const { error } = await db
    .from('leads')
    .update({ opted_out: false, opted_out_at: null })
    .eq('id', leadId);
  if (error) {
    console.error('[SMS — OPT-IN FAILED]', { leadId, error: error.message, code: error.code });
  }
  console.log('[SMS — OPT-IN]', { leadId });
}
