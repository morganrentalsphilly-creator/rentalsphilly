// Shared HTML email layout + per-template helpers.
//
// Every outbound transactional email should go through `htmlShell` so the
// branding stays consistent (header, footer, button styles, fonts).
//
// Plain-text fallbacks live next to the HTML versions for any client that
// prefers text/plain. sendEmail() already takes `body` (plain text); add
// `html` to also include the rich version.

const BRAND_GOLD = '#b58e54';
const BRAND_GOLD_SOFT = '#f5ecdc';
const BRAND_INK = '#1c1f2a';
const TEXT_COLOR = '#334155';
const BG = '#f8fafc';

// Wrap arbitrary HTML body in the branded shell. `preheader` is the gray
// preview text most email clients show next to the subject in the inbox.
export function htmlShell({ body, preheader = '', footerNote = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Rentals Philly</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Inter','Helvetica Neue',Arial,sans-serif;color:${TEXT_COLOR};">
<div style="display:none;font-size:1px;color:${BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <tr>
          <td style="padding:24px 32px;border-bottom:3px solid ${BRAND_GOLD};">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND_GOLD};">Rentals Philly</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:2px;">Hand-picked Philly rentals</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;font-size:15px;line-height:1.6;color:${TEXT_COLOR};">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:${BRAND_GOLD_SOFT};border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;line-height:1.5;">
            ${footerNote ? `<div style="margin-bottom:8px;">${footerNote}</div>` : ''}
            <div>Rentals Philly · Philadelphia, PA</div>
            <div style="margin-top:4px;">
              <a href="https://rentalsphilly.vercel.app" style="color:#64748b;text-decoration:underline;">rentalsphilly.vercel.app</a>
              &nbsp;·&nbsp;
              <a href="https://rentalsphilly.vercel.app/privacy" style="color:#64748b;text-decoration:underline;">Privacy</a>
              &nbsp;·&nbsp;
              <a href="https://rentalsphilly.vercel.app/terms" style="color:#64748b;text-decoration:underline;">Terms</a>
            </div>
            <div style="margin-top:8px;color:#94a3b8;">Reply STOP to opt out of text messages.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function brandedButton(href, label) {
  return `<a href="${href}" style="display:inline-block;background:${BRAND_GOLD};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:15px;">${escapeHtml(label)} →</a>`;
}

// Convert plain-text body (with \n breaks) to HTML paragraphs.
export function plainToHtml(text) {
  if (!text) return '';
  return String(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Per-template helpers ----
//
// Each returns { html, body, subject? } so callers can drop straight into sendEmail.

export function welcomeEmailHtml({ firstName, emailBody, emailSubject, agentName }) {
  const greeting = `<p style="margin:0 0 14px;font-size:17px;color:${BRAND_INK};font-weight:600;">Hi ${escapeHtml(firstName)},</p>`;
  return htmlShell({
    preheader: emailSubject || 'Welcome to Rentals Philly',
    body: greeting + plainToHtml(emailBody),
    footerNote: agentName ? `${escapeHtml(agentName)} · Rentals Philly` : '',
  });
}

export function tourConfirmationHtml({ firstName, tours, agentName, agentPhone }) {
  const list = (tours || []).map((t) => `
    <tr>
      <td style="padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
        <div style="font-weight:600;color:${BRAND_INK};font-size:15px;">${escapeHtml(t.address)}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px;">${escapeHtml(t.date)} · ${escapeHtml(t.time)}</div>
      </td>
    </tr>
    <tr><td style="height:8px;"></td></tr>
  `).join('');
  return htmlShell({
    preheader: `${tours?.length || 0} tour${tours?.length === 1 ? '' : 's'} confirmed`,
    body: `
      <p style="margin:0 0 14px;font-size:17px;color:${BRAND_INK};font-weight:600;">You're booked, ${escapeHtml(firstName)}!</p>
      <p style="margin:0 0 18px;">Here are the tours we've set up for you:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${list}</table>
      <p style="margin:18px 0 6px;">We'll text you a reminder 24 hours and 1 hour before each tour. If anything changes, ${agentPhone ? `text ${escapeHtml(agentPhone)}` : 'reply to this email'}.</p>
      <p style="margin:0 0 14px;color:#64748b;font-size:13px;">— ${escapeHtml(agentName || 'Morgan')} · Rentals Philly</p>
    `,
  });
}

export function schedulingLinkHtml({ firstName, agentName, url }) {
  return htmlShell({
    preheader: `Pick your tour times`,
    body: `
      <p style="margin:0 0 14px;font-size:17px;color:${BRAND_INK};font-weight:600;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 18px;">I checked availability on the properties you picked. Tap below to choose your tour times:</p>
      <div style="text-align:center;margin:24px 0;">${brandedButton(url, 'Pick my tour times')}</div>
      <p style="margin:0 0 14px;color:#64748b;font-size:13px;">— ${escapeHtml(agentName || 'Morgan')} · Rentals Philly</p>
    `,
  });
}

export function curatedLinkHtml({ firstName, agentName, url }) {
  return htmlShell({
    preheader: `Your hand-picked Philly rentals`,
    body: `
      <p style="margin:0 0 14px;font-size:17px;color:${BRAND_INK};font-weight:600;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 18px;">I hand-picked rentals that match what you're looking for. Take a look and let me know which ones interest you:</p>
      <div style="text-align:center;margin:24px 0;">${brandedButton(url, 'View my matches')}</div>
      <p style="margin:0 0 8px;">Click the button, browse the photos, then come back and let me know which properties you'd like to tour. I'll handle the rest.</p>
      <p style="margin:0 0 14px;color:#64748b;font-size:13px;">— ${escapeHtml(agentName || 'Morgan')} · Rentals Philly</p>
    `,
  });
}

export function genericHtml({ subject, body, agentName, agentPhone }) {
  // For ad-hoc messages: wraps any plain text in the brand shell.
  return htmlShell({
    preheader: subject,
    body: plainToHtml(body),
    footerNote: agentName ? `${escapeHtml(agentName)}${agentPhone ? ` · ${escapeHtml(agentPhone)}` : ''}` : '',
  });
}
