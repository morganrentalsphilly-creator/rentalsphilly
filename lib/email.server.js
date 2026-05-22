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
import { htmlShell, plainToHtml, genericHtml, buildSignature } from '@/lib/email-templates';

// Pull agent identity + signature fields out of the settings row so every
// outbound email gets a consistent signature without each call site having
// to thread the data through. Read-only, called from sendEmail(). Failures
// are non-fatal — the signature just goes missing for that send.
//
// Cached for 60 seconds per process to avoid hammering Postgres on every
// send. Settings are edited rarely so 60s is a fine staleness window.
let _settingsCache = null;
let _settingsCacheAt = 0;
async function loadSettings(db) {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheAt < 60_000) return _settingsCache;
  try {
    const { data } = await db.from('settings').select('*').eq('id', 1).maybeSingle();
    if (!data) return null;
    // settings has a `raw` jsonb where we stash any field that doesn't
    // have a dedicated column. Flatten so buildSignature() sees one shape.
    const merged = { ...data, ...(data.raw || {}) };
    _settingsCache = merged;
    _settingsCacheAt = now;
    return merged;
  } catch (e) {
    return null;
  }
}

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
  html,           // optional — explicit HTML body. If omitted we auto-generate.
  to,
  kind,
  idempotencyKey,
  automated,
  internal,       // when true, the message row is marked internal so it
                  // doesn't appear in the lead's customer-facing thread.
                  // Used for agent-only alerts (e.g. "new inbound text").
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
        internal: internal === true,
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

  // Real send. We always include both `text` and `html` versions so clients
  // that don't support HTML get a clean plain-text fallback. If the caller
  // didn't pass explicit HTML, we wrap the plain body in our brand shell —
  // which now includes the rich signature card from buildSignature(settings).
  //
  // Plain-text body: we append a multi-line signature block UNLESS the body
  // already looks signed (heuristic: contains "—" near the end). This avoids
  // double-signing for templates that have a baked-in `— {agentName}` line.
  // Agent-only internal emails (e.g. inbound-SMS alerts) skip the signature
  // because they aren't a customer-facing message.
  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) throw new Error('Missing RESEND_FROM_EMAIL');

    const settings = await loadSettings(db);
    const sig = settings ? buildSignature(settings) : null;
    const isInternalAlert = internal === true;

    // Strip any legacy "— Name" one-line sign-off near the bottom of the
    // body so the rich signature isn't doubled up with a stale handwritten
    // signoff. We only strip the LAST `—` line (and any trailing whitespace
    // after it) — not anything in the middle of the body (which might be a
    // legitimate em-dash use in prose).
    //
    // Internal agent-only alerts are exempt from both stripping AND signing
    // — those are Morgan→Morgan and don't need branding.
    const stripTrailingSignoff = (text) => {
      if (!text) return text;
      const lines = String(text).split('\n');
      // Walk from the end, skipping blank lines, until we find the first
      // non-blank. If it's a sign-off ("— Foo" or "—" alone), strip it +
      // any trailing blank lines.
      let i = lines.length - 1;
      while (i >= 0 && lines[i].trim() === '') i--;
      if (i >= 0 && /^\s*—(\s|$)/.test(lines[i])) {
        return lines.slice(0, i).join('\n').replace(/\s+$/, '');
      }
      return text;
    };

    const cleanedBody = isInternalAlert ? body : stripTrailingSignoff(body);

    // Plain-text body: cleanedBody + signature. Internal alerts skip both
    // the strip and the appender so Morgan sees the raw note unchanged.
    let textBody = cleanedBody;
    if (sig?.text && !isInternalAlert) {
      textBody = `${cleanedBody}\n\n${sig.text}`;
    }

    // HTML body: caller may pass explicit HTML for templates that build
    // their own shell (welcome, scheduling-link, tour-confirm — they each
    // call buildSignature() themselves). Otherwise wrap the cleaned body
    // in genericHtml so the rich signature renders as a card below.
    const htmlBody = html || genericHtml({ subject, body: cleanedBody, settings });

    const { data, error } = await resend().emails.send({
      from: fromEmail,
      to: [target],
      subject,
      text: textBody,
      html: htmlBody,
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
