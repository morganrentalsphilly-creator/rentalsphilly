// Helper for triggering real email/SMS sends from the app.
// Server-side API routes (/api/send-email, /api/send-sms) handle the actual work.

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
        return { ok: false, error: data.error || 'Unknown error' };
      }
      return { ok: true, ...data };
    } catch (err) {
      console.error('[messaging] Network error', err);
      return { ok: false, error: err.message };
    }
  }
  
  export async function sendEmail({ to, subject, body }) {
    if (!to || !subject || !body) {
      console.warn('[messaging] sendEmail skipped — missing field', { to, subject });
      return { ok: false, error: 'Missing field' };
    }
    return postJSON('/api/send-email', { to, subject, body });
  }
  
  export async function sendSMS({ to, body }) {
    if (!to || !body) {
      console.warn('[messaging] sendSMS skipped — missing field', { to });
      return { ok: false, error: 'Missing field' };
    }
    // Ensure the number is in E.164 format (+1...)
    let normalizedTo = String(to).trim();
    const digits = normalizedTo.replace(/\D/g, '');
    if (digits.length === 10) normalizedTo = `+1${digits}`;
    else if (digits.length === 11 && digits.startsWith('1')) normalizedTo = `+${digits}`;
    else if (!normalizedTo.startsWith('+')) {
      console.warn('[messaging] sendSMS skipped — unrecognized phone format', { to });
      return { ok: false, error: 'Invalid phone format' };
    }
    return postJSON('/api/send-sms', { to: normalizedTo, body });
  }