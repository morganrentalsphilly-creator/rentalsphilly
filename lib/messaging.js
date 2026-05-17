// Client-side helpers for triggering real email/SMS sends.
// Server-side API routes (/api/send-email, /api/send-sms) own the actual work.
//
// IMPORTANT: as of the SMS refinement, sendSMS now requires { leadId, body, kind }.
// The old { to, body } shape is rejected by the server with a clear error so we
// can find every stale caller.

async function postJSON(url, payload) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[messaging] API error', { url, status: res.status, data });
      return { ok: false, error: data.error || 'Unknown error', ...data };
    }
    return { ok: true, ...data };
  } catch (err) {
    console.error('[messaging] Network error', err);
    return { ok: false, error: err.message };
  }
}

// Send email via the server wrapper. Prefer passing { leadId, subject, body, kind }
// so the email shows up in the lead's inbox. Falls back to { to, subject, body }
// for cases where there's no lead context (rare).
export async function sendEmail({ leadId, subject, body, to, kind, idempotencyKey, automated }) {
  if (!subject || !body) {
    console.warn('[messaging] sendEmail skipped — missing subject/body');
    return { ok: false, error: 'Missing field (need subject, body)' };
  }
  if (!leadId && !to) {
    console.warn('[messaging] sendEmail skipped — missing leadId/to');
    return { ok: false, error: 'Missing field (need leadId or to)' };
  }
  return postJSON('/api/send-email', { leadId, subject, body, to, kind, idempotencyKey, automated });
}

// Real SMS send. Routes through the server wrapper which handles opt-out,
// idempotency, message-row insertion, and the kill switch.
//
//   sendSMS({ leadId, body, kind, idempotencyKey?, automated?, to? })
//
//   leadId   — uuid of the lead. REQUIRED.
//   body     — text. REQUIRED.
//   kind     — one of: 'welcome' | 'tour_confirmation' | 'virtual_tour' |
//              'manual' | 'nudge_48hr' | 'nudge_5day' | 'reminder_24hr' |
//              'reminder_1hr' | 'blast' | 'screening_followup' |
//              'application_followup'. REQUIRED.
//   to       — optional override of the lead's phone (rare).
//   idempotencyKey — optional. Same key + same body = no-op (returns prior result).
//   automated — optional boolean. Defaults to true unless kind === 'manual'.
//
// Returns: { ok, simulated?, message?, twilioSid?, error? }
//   On success the `message` field is the inserted DB row — push it into your
//   in-memory lead.messages so the UI stays in sync.
export async function sendSMS({ leadId, body, kind, to, idempotencyKey, automated }) {
  if (!leadId || !body || !kind) {
    console.warn('[messaging] sendSMS skipped — missing field', { leadId: !!leadId, body: !!body, kind });
    return { ok: false, error: 'Missing field (need leadId, body, kind)' };
  }
  return postJSON('/api/send-sms', { leadId, body, kind, to, idempotencyKey, automated });
}
