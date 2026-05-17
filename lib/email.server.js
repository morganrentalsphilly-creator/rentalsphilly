// ============================================================================
// Server-side email wrapper. Mirrors lib/sms.server.js for symmetry:
//
//   - one chokepoint for every outbound email
//   - message row written to `messages` with delivery_status tracked
//   - idempotency check (no double-sends on retry / double-click)
//   - ENABLE_REAL_SENDING kill switch
//
// NEVER import this from a client component. Only from /api/* routes.
// ============================================================================

import { Resend } from 'resend';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

let _resend = null;
function resend() {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Missing RESEND_API_KEY');
  }
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// ---- sendEmail({ leadId, subject, body, to?, kind?, idempotencyKey?, automated? })
//
//   leadId            required when sending to a known lead — logs to messages.
//                     If absent, sends an "anonymous" email (no DB row).
//   subject           required
//   body              required — plain text. (HTML can come later.)
//   to                optional override; defaults to lead.email
//   kind              optional categorization (welcome, tour_confirmation, ...)
//   idempotencyKey    optional; same key = no double-send
//   automated         optional boolean
//
// Returns { ok, simulated?, message?, resendId?, error? }
// ============================================================================

export async function sendEmail({
  leadId,
  subject,
  body,
  to,
  kind,
  idempotencyKey,
  automated,
}) {
  if (!subject) return { ok: false, error: 'missing_subject' };
  if (!body) return { ok: false, error: 'missing_body' };

  const db = supabaseAdmin();
  const isAutomated = typeof automated === 'boolean' ? automated : true;

  let lead = null;
  let target = to;

  if (leadId) {
    const { data, error } = await db
      .from('leads')
      .select('id, full_name, email')
      .eq('id', leadId)
      .single();
    if (error || !data) {
      return { ok: false, error: 'lead_not_found' };
    }
    lead = data;
    if (!target) target = lead.email;
  }

  if (!target) {
    return { ok: false, error: 'missing_to' };
  }

  // Idempotency — return prior row if seen.
  if (idempotencyKey && leadId) {
    const { data: existing } = await db
      .from('messages')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) {
      return {
        ok: existing.delivery_status !== 'failed',
        message: existing,
        simulated: existing.delivery_status === 'simulated',
      };
    }
  }

  // Pre-insert. Only if we have a leadId (anonymous emails skip the row).
  let pending = null;
  if (leadId) {
    const explicitId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await db
      .from('messages')
      .insert({
        id: explicitId,
        lead_id: lead.id,
        channel: 'email',
        direction: 'outbound',
        status: 'sent',                // legacy
        delivery_status: 'queued',
        to: target,
        via: 'resend',
        subject,
        body,
        kind: kind || null,
        automated: isAutomated,
        internal: false,
        idempotency_key: idempotencyKey || crypto.randomUUID(),
      })
      .select()
      .single();
    if (error) {
      console.error('[EMAIL — PRE-INSERT FAILED]', {
        leadId, kind, errMsg: error.message, errCode: error.code,
        errDetails: error.details, errHint: error.hint,
      });
      return { ok: false, error: error.message };
    }
    pending = data;
  }

  // Kill switch.
  if (process.env.ENABLE_REAL_SENDING !== 'true') {
    console.log('[EMAIL — SIMULATED]', {
      to: target, kind, leadId, subject,
    });
    if (pending) {
      const { data: updated } = await db
        .from('messages')
        .update({ delivery_status: 'simulated', sent_at: new Date().toISOString() })
        .eq('id', pending.id)
        .select()
        .single();
      return { ok: true, simulated: true, message: updated || pending };
    }
    return { ok: true, simulated: true };
  }

  // Real send.
  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) throw new Error('Missing RESEND_FROM_EMAIL');
    const { data, error } = await resend().emails.send({
      from: fromEmail,
      to: [target],
      subject,
      text: body,
    });
    if (error) throw new Error(error.message || 'resend_failed');

    if (pending) {
      const { data: updated } = await db
        .from('messages')
        .update({
          twilio_sid: null,                  // not Twilio, but unify the SID column for "provider id"
          delivery_status: 'sent',
          sent_at: new Date().toISOString(),
          // Resend doesn't return a separate id field with status callbacks like Twilio does;
          // store the resend id in twilio_sid (re-purposed) so we have a provider id to grep.
        })
        .eq('id', pending.id)
        .select()
        .single();
      // Stash the Resend id separately so we can map it later
      if (data?.id) {
        await db.from('messages').update({ twilio_sid: `resend:${data.id}` }).eq('id', pending.id);
      }
      return { ok: true, message: updated || pending, resendId: data?.id };
    }
    return { ok: true, resendId: data?.id };
  } catch (err) {
    const errMsg = err?.message || 'resend_failed';
    console.error('[EMAIL — RESEND ERROR]', { leadId, kind, msg: errMsg });

    if (pending) {
      const { data: failed } = await db
        .from('messages')
        .update({
          delivery_status: 'failed',
          error_message: errMsg.slice(0, 500),
        })
        .eq('id', pending.id)
        .select()
        .single();
      return { ok: false, error: errMsg, message: failed || pending };
    }
    return { ok: false, error: errMsg };
  }
}
