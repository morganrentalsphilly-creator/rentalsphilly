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

// Build a rich, branded email signature from the agent's settings. Returns
// both an HTML block (suitable for placement inside htmlShell's body) and a
// plain-text block (suitable for appending to the plain `body` text).
//
// Source of truth for signature fields:
//   settings.agentName, agent_name           → display name
//   settings.signature.title  / signatureTitle → "Founder & Lead Agent"
//   settings.agentPhone, agent_phone         → click-to-call
//   settings.agentEmail, agent_email         → mailto link
//   settings.signature.website / signatureWebsite → public site URL
//   settings.signature.tagline / signatureTagline → optional one-liner
//   settings.signature.licenseLine / signatureLicenseLine → PA license # etc.
//   settings.signature.fairHousing (boolean, default true) → fair housing line
//
// All fields are optional. The block gracefully collapses when fields are
// missing — never renders an empty row.
export function buildSignature(settings = {}) {
  const sig = settings.signature || {};
  const name  = settings.agentName  || settings.agent_name  || '';
  const email = settings.agentEmail || settings.agent_email || '';
  const phone = settings.agentPhone || settings.agent_phone || '';
  const title = sig.title    || settings.signatureTitle    || 'Rental Agent · Rentals Philly';
  const site  = sig.website  || settings.signatureWebsite  || 'rentalsphilly.com';
  const tagline = sig.tagline  || settings.signatureTagline  || '';
  const license = sig.licenseLine || settings.signatureLicenseLine || '';
  const fairHousing = sig.fairHousing !== false;
  const siteHref = site.startsWith('http') ? site : `https://${site}`;
  const siteLabel = site.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // ---- Plain-text version (for the email's text/plain part) ----
  const textLines = [];
  textLines.push('—');
  if (name)  textLines.push(name + (title ? `, ${title}` : ''));
  else if (title) textLines.push(title);
  const contactBits = [];
  if (phone) contactBits.push(phone);
  if (email) contactBits.push(email);
  if (contactBits.length) textLines.push(contactBits.join(' · '));
  if (siteLabel) textLines.push(siteLabel);
  if (tagline) textLines.push('');
  if (tagline) textLines.push(tagline);
  if (license) textLines.push(license);
  if (fairHousing) textLines.push('Rentals Philly supports Equal Housing Opportunity.');
  const text = textLines.join('\n');

  // ---- HTML version (rich card, brand-colored accent rail) ----
  const initial = (name || 'R').trim().charAt(0).toUpperCase();
  const html = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;border-top:1px solid #e2e8f0;padding-top:18px;">
  <tr>
    <td style="vertical-align:top;width:52px;padding-right:14px;">
      <div style="width:44px;height:44px;border-radius:50%;background:${BRAND_GOLD};color:#ffffff;font-weight:700;font-size:18px;display:inline-block;text-align:center;line-height:44px;font-family:-apple-system,BlinkMacSystemFont,'Inter','Helvetica Neue',Arial,sans-serif;">${escapeHtml(initial)}</div>
    </td>
    <td style="vertical-align:top;font-size:13px;line-height:1.55;color:${TEXT_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Inter','Helvetica Neue',Arial,sans-serif;">
      ${name  ? `<div style="font-weight:700;color:${BRAND_INK};font-size:14px;">${escapeHtml(name)}</div>` : ''}
      ${title ? `<div style="color:#64748b;font-size:12px;margin-bottom:6px;">${escapeHtml(title)}</div>` : ''}
      ${phone ? `<div><a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ''))}" style="color:${TEXT_COLOR};text-decoration:none;">${escapeHtml(phone)}</a></div>` : ''}
      ${email ? `<div><a href="mailto:${escapeHtml(email)}" style="color:${BRAND_GOLD};text-decoration:none;">${escapeHtml(email)}</a></div>` : ''}
      ${site  ? `<div><a href="${escapeHtml(siteHref)}" style="color:#64748b;text-decoration:underline;">${escapeHtml(siteLabel)}</a></div>` : ''}
      ${tagline ? `<div style="color:#94a3b8;font-style:italic;margin-top:8px;font-size:12px;">${escapeHtml(tagline)}</div>` : ''}
      ${license ? `<div style="color:#94a3b8;font-size:11px;margin-top:6px;">${escapeHtml(license)}</div>` : ''}
      ${fairHousing ? `<div style="color:#94a3b8;font-size:11px;margin-top:6px;">⌂ Rentals Philly supports Equal Housing Opportunity.</div>` : ''}
    </td>
  </tr>
</table>`;

  return { html, text };
}

// Wrap arbitrary HTML body in the branded shell. `preheader` is the gray
// preview text most email clients show next to the subject in the inbox.
// `signatureHtml` is rendered between the body and the footer — pass the
// HTML form returned by buildSignature(settings).
export function htmlShell({ body, preheader = '', footerNote = '', signatureHtml = '' }) {
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
            ${signatureHtml || ''}
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

export function welcomeEmailHtml({ firstName, emailBody, emailSubject, agentName, settings }) {
  const greeting = `<p style="margin:0 0 14px;font-size:17px;color:${BRAND_INK};font-weight:600;">Hi ${escapeHtml(firstName)},</p>`;
  const sig = settings ? buildSignature(settings) : { html: '' };
  return htmlShell({
    preheader: emailSubject || 'Welcome to Rentals Philly',
    body: greeting + plainToHtml(emailBody),
    signatureHtml: sig.html,
  });
}

export function tourConfirmationHtml({ firstName, tours, agentName, agentPhone, settings }) {
  const list = (tours || []).map((t) => `
    <tr>
      <td style="padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
        <div style="font-weight:600;color:${BRAND_INK};font-size:15px;">${escapeHtml(t.address)}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px;">${escapeHtml(t.date)} · ${escapeHtml(t.time)}</div>
      </td>
    </tr>
    <tr><td style="height:8px;"></td></tr>
  `).join('');
  const sig = settings ? buildSignature(settings) : buildSignature({ agentName, agentPhone });
  return htmlShell({
    preheader: `${tours?.length || 0} tour${tours?.length === 1 ? '' : 's'} confirmed`,
    body: `
      <p style="margin:0 0 14px;font-size:17px;color:${BRAND_INK};font-weight:600;">You're booked, ${escapeHtml(firstName)}!</p>
      <p style="margin:0 0 18px;">Here are the tours we've set up for you:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${list}</table>
      <p style="margin:18px 0 6px;">We'll text you a reminder 24 hours and 1 hour before each tour. If anything changes, ${agentPhone ? `text ${escapeHtml(agentPhone)}` : 'reply to this email'}.</p>
    `,
    signatureHtml: sig.html,
  });
}

export function schedulingLinkHtml({ firstName, agentName, url, settings }) {
  const sig = settings ? buildSignature(settings) : buildSignature({ agentName });
  return htmlShell({
    preheader: `Pick your tour times`,
    body: `
      <p style="margin:0 0 14px;font-size:17px;color:${BRAND_INK};font-weight:600;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 18px;">I checked availability on the properties you picked. Tap below to choose your tour times:</p>
      <div style="text-align:center;margin:24px 0;">${brandedButton(url, 'Pick my tour times')}</div>
    `,
    signatureHtml: sig.html,
  });
}

export function curatedLinkHtml({ firstName, agentName, url, settings }) {
  const sig = settings ? buildSignature(settings) : buildSignature({ agentName });
  return htmlShell({
    preheader: `Your hand-picked Philly rentals`,
    body: `
      <p style="margin:0 0 14px;font-size:17px;color:${BRAND_INK};font-weight:600;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 18px;">I hand-picked rentals that match what you're looking for. Take a look and let me know which ones interest you:</p>
      <div style="text-align:center;margin:24px 0;">${brandedButton(url, 'View my matches')}</div>
      <p style="margin:0 0 8px;">Click the button, browse the photos, then come back and let me know which properties you'd like to tour. I'll handle the rest.</p>
    `,
    signatureHtml: sig.html,
  });
}

export function genericHtml({ subject, body, agentName, agentPhone, settings }) {
  // For ad-hoc messages: wraps any plain text in the brand shell + signature.
  const sig = settings ? buildSignature(settings) : buildSignature({ agentName, agentPhone });
  return htmlShell({
    preheader: subject,
    body: plainToHtml(body),
    signatureHtml: sig.html,
  });
}
