// POST /api/intake/welcome
//
// Fires the entire welcome flow for a freshly-created lead, server-side:
//   1. AI-personalized welcome draft (optional, falls back to template)
//   2. Welcome email via Resend wrapper
//   3. Welcome SMS via Twilio wrapper
//   4. Agent notification email
//
// Auth model: PUBLIC, because it must be callable from the anonymous intake
// form. Abuse protection is built-in:
//   - leadId must point to a lead created in the last 5 minutes
//   - welcome must not already exist for this lead (idempotency on kind='welcome')
//   - request is rate-limited implicitly by the lead-was-just-created constraint
//
// Request body: { leadId }
// Returns: { ok, sentSms, sentEmail, sentAgentNotif }

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSms } from '@/lib/sms.server';
import { sendEmail } from '@/lib/email.server';

const FRESH_LEAD_WINDOW_MS = 5 * 60 * 1000;   // 5 minutes
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 600;

// ---- AI welcome-draft logic (extracted from /api/ai/welcome-draft) so this
// route can call it without an external fetch + token. Returns null on any
// failure so the caller falls back to the static template.
async function aiWelcomeDraft(lead, agentName, applicationUrl) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const firstName = (lead.full_name || '').split(' ')[0] || 'there';
  const budget = lead.budget_min && lead.budget_max ? `$${lead.budget_min}-$${lead.budget_max}/mo` : null;
  const beds = lead.beds === '0' ? 'studio' : (lead.beds ? `${lead.beds}+ bed` : null);
  const areas = lead.areas || null;
  const moveIn = lead.move_in_date ? new Date(lead.move_in_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null;
  const bucket = lead.bucket || '';
  const isSoon = bucket === 'GCMS' || bucket === 'BCMS';
  const needsApp = bucket === 'BCMS' || bucket === 'BC75+';

  // NOTE: deliberately NOT including credit profile in the prompt context.
  // We treat credit as a private bucket signal that drives WORKFLOW (which
  // template to use, whether to ask for an application) — never as
  // language the lead sees. Mentioning credit in customer-facing copy is
  // a non-starter for tone + fairness reasons.
  const profile = [
    firstName ? `Name: ${firstName}` : null,
    budget ? `Budget: ${budget}` : null,
    beds ? `Wants: ${beds}` : null,
    areas ? `Neighborhoods: ${areas}` : null,
    moveIn ? `Move-in: ${moveIn}` : null,
    `Move timeline: ${isSoon ? 'soon (next ~75 days)' : 'further out (75+ days)'}`,
  ].filter(Boolean).join('\n');

  // Bucket-specific strategy. ZERO credit mentions.
  let strategyNote;
  if (bucket === 'GCMS') {
    strategyNote = 'They are moving SOON. Tell them you are hand-picking rentals NOW and will send a personalized link with photos shortly. Warm and direct — they should expect to hear back fast.';
  } else if (bucket === 'GCM75+') {
    strategyNote = 'They are moving LATER (75+ days out). Tell them you will reach out about 75 days before their move-in date with hand-picked rentals. Set expectations: light touch until then.';
  } else if (bucket === 'BCMS') {
    strategyNote = `They are moving SOON and we want them to complete a rental application BEFORE we start hunting (so we can move fast when the right place comes up). Include this application link prominently and ask them to fill it out as the next step: ${applicationUrl || '[application link will be added by agent]'}`;
  } else if (bucket === 'BC75+') {
    strategyNote = 'They are moving LATER (75+ days out). Tell them you will reach out about 75 days before their move-in date with a quick application link to get the ball rolling. Set expectations: light touch until then.';
  } else {
    strategyNote = 'Acknowledge what they are looking for and tell them you will follow up shortly.';
  }

  const prompt = `You are ${agentName || 'Morgan'}, a Philadelphia rental agent. A new lead just submitted your intake form. Write a personalized welcome SMS AND a personalized welcome email referencing their actual criteria — not a generic template.

Lead profile:
${profile}

Strategy: ${strategyNote}

Output STRICTLY as JSON with three fields:
{
  "sms": "...",
  "emailSubject": "...",
  "email": "..."
}

Constraints:
- SMS: <= 320 chars. Start with "Rentals Philly:" so they know who it's from. Reference 1-2 specifics (their neighborhood, budget, or timing). End with "Reply STOP to opt out." End the SMS itself; no signature.
- emailSubject: <= 60 chars. Conversational, references their specific situation.
- email: 3-5 short sentences (body only — no "Hi {name}" since we add the greeting separately, no sign-off since we add the signature). Warm, specific, acknowledges what they're looking for, sets expectations for what happens next.
- NEVER mention credit, credit score, credit profile, financial situation, or anything similar. Credit is private and never referenced in customer-facing copy.
- NEVER make up specific listings or addresses or prices.
- Use the lead's first name once or twice — naturally, not in every sentence.
- No emoji.
- Output ONLY the JSON object, nothing else. No code fences, no commentary.`;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!apiRes.ok) return null;
    const data = await apiRes.json();
    const raw = (data?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed?.sms || !parsed?.email || !parsed?.emailSubject) return null;
    return {
      sms: String(parsed.sms).slice(0, 480),
      emailSubject: String(parsed.emailSubject).slice(0, 120),
      email: String(parsed.email).slice(0, 4000),
    };
  } catch (err) {
    console.warn('[intake/welcome] ai draft failed', err?.message);
    return null;
  }
}

// Default static bucket templates. Match the shape used in addLead so the
// fallback experience is identical when AI is off / down.
//
// RULES (these are PRODUCT POLICY, not just copy choices):
//   1. NEVER mention credit, credit score, or any financial-profile language
//      in customer-facing copy. Bucket is a private workflow signal only.
//   2. BCMS leads MUST receive the general rental application link in the
//      welcome so they can submit before we schedule tours.
//   3. BC75+ leads MUST be told we'll send the application link 75 days
//      before move-in (so they're not surprised when it arrives).
//   4. GCM75+ leads MUST be told we'll start curating 75 days before
//      move-in (so they understand why it's quiet now).
//
// {applicationUrl} is the only token that depends on settings; the rest are
// derived from the lead. fill() resolves all of them before send.
// NOTE: email bodies deliberately have NO `— {agentName}` sign-off line.
// sendEmail() appends a settings-driven signature block (name, title, phone,
// email, website, fair-housing line) to both the plain-text and HTML
// versions automatically. Leaving the legacy sign-off here would render as a
// double signature.
const DEFAULT_TEMPLATES = {
  GCMS: {
    sms: `Rentals Philly: Got it, {firstName} — I'm hand-picking rentals for you now. You'll get a personalized link with photos soon. Reply STOP to opt out.`,
    emailSubject: `Hand-picked Philly rentals — incoming`,
    email: `Hi {firstName},\n\nThanks for reaching out. Since you're moving soon, I'm prioritizing your search — I'll hand-pick rentals that match what you described and send you a personalized link.\n\nWhen the link arrives, tap through to view photos and tell me which ones you'd like to tour. I'll handle the scheduling from there.\n\nTalk soon,`,
  },
  BCMS: {
    sms: `Rentals Philly: Got it, {firstName}! To get you ready fast, please submit a quick application here so we can move when the right place comes up: {applicationUrl} — Reply STOP to opt out.`,
    emailSubject: `One quick step before we start hunting`,
    email: `Hi {firstName},\n\nThanks for reaching out. To make sure we can move fast when the right place comes up, the first step is a quick rental application:\n\n{applicationUrl}\n\nOnce I have that on file, I'll start hand-picking rentals that match your budget and neighborhoods, and we'll schedule tours from there. The application takes about 10 minutes.\n\nTalk soon,`,
  },
  'GCM75+': {
    sms: `Rentals Philly: Thanks {firstName}! Since your move is further out, I'll reach out about 75 days before {moveInDate} with hand-picked rentals. Save my number for the meantime. Reply STOP to opt out.`,
    emailSubject: `Got you on the calendar for {moveInDate}`,
    email: `Hi {firstName},\n\nThanks for letting me know what you're looking for. Since your move-in is further out, I'll start curating about 75 days before {moveInDate}. That's when listings for your window will actually be on the market.\n\nIn the meantime, save my contact — if your timeline shifts or you have questions, text me anytime.`,
  },
  'BC75+': {
    sms: `Rentals Philly: Thanks {firstName}! Since your move is further out, I'll send you a quick application link about 75 days before {moveInDate} so we can hit the ground running. Save my number for the meantime. Reply STOP to opt out.`,
    emailSubject: `Planning ahead for {moveInDate}`,
    email: `Hi {firstName},\n\nThanks for reaching out. Since your move-in is further out, here's how I'll work with you:\n\nAbout 75 days before {moveInDate}, I'll send a quick application link to get started — that's the first step so we can move fast when the right place comes up. After that, I'll hand-pick rentals and we'll schedule tours.\n\nIf your timeline shifts or you have questions before then, text me anytime.`,
  },
};

const BUCKET_HINTS = {
  GCMS: 'HOT — moving soon, good credit',
  'GCM75+': 'WARM — moving 75+ days, good credit',
  BCMS: 'WORK WITH — moving soon, limited credit',
  'BC75+': 'LONGTAIL — moving 75+ days, limited credit',
};

export async function POST(request) {
  try {
    const { leadId } = await request.json();
    if (!leadId) {
      return NextResponse.json({ ok: false, error: 'missing_leadId' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const [leadRes, settingsRes] = await Promise.all([
      db.from('leads').select('*').eq('id', leadId).single(),
      db.from('settings').select('*').eq('id', 1).single(),
    ]);
    if (leadRes.error || !leadRes.data) {
      return NextResponse.json({ ok: false, error: 'lead_not_found' }, { status: 404 });
    }

    const lead = leadRes.data;
    const settings = settingsRes.data || {};

    // ---- ABUSE GUARDS ----
    // 1) Lead must have been created within the last 5 minutes. Older leads
    //    must use the admin-only /api/send-sms / /api/send-email surfaces.
    const createdAt = new Date(lead.created_at || 0).getTime();
    if (!createdAt || Date.now() - createdAt > FRESH_LEAD_WINDOW_MS) {
      return NextResponse.json({ ok: false, error: 'lead_too_old' }, { status: 403 });
    }
    // 2) Welcome must not already be in flight / sent. Check for any existing
    //    welcome message row for this lead. Use `.limit(1)` (NOT
    //    `.maybeSingle()`) because the welcome flow inserts TWO rows on a
    //    successful run — one for SMS and one for email, both with
    //    kind='welcome'. maybeSingle() would throw on the 2-row case, making
    //    every retry of this endpoint return 500 instead of "alreadySent".
    const { data: existing } = await db
      .from('messages')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('kind', 'welcome')
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, alreadySent: true });
    }

    // ---- BUILD TEMPLATES (with fallback chain: settings.welcomeMessages → DEFAULT_TEMPLATES) ----
    const bucket = lead.bucket || 'GCMS';
    const firstName = (lead.full_name || '').split(' ')[0] || 'there';
    const moveInLabel = lead.move_in_date ? new Date(lead.move_in_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'your move date';
    const agentName = settings.agentName || settings.agent_name || 'Morgan';
    const agentEmail = settings.agentEmail || settings.agent_email;
    // The general RentSpree application URL Morgan sends to BCMS leads
    // up-front, and to BC75+ leads 75 days before move-in. Resolves from
    // settings.rentSpree.applicationUrl OR settings.rentspree_application_url
    // (DB column name), with a fallback that still produces a clickable line
    // — but the BCMS/BC75+ templates aren't very useful without this set.
    const applicationUrl =
      settings.rentSpree?.applicationUrl ||
      settings.rentspree_application_url ||
      settings.application_url ||
      '';

    // SAFETY NET: If a BCMS / BC75+ lead is about to be welcomed but the
    // general application URL hasn't been configured yet, we MUST NOT ship
    // a placeholder string ("[application link — set in Settings →
    // Integrations]") to the lead. Their welcome literally says "fill out
    // this application: <placeholder>" — that's a "rentals philly looks
    // amateur" moment that loses the lead instantly.
    //
    // Two-layer fallback:
    //   1. Use whichever bucket-specific template DOESN'T require the URL
    //      (GCMS for moving-soon, GCM75+ for further-out), so the lead gets
    //      a coherent "I'm working on your search" message instead.
    //   2. Page the agent — Morgan needs to know this is happening so she
    //      can fix it ASAP — using the same internal-email channel as the
    //      inbound-SMS alerts.
    let effectiveBucket = bucket;
    if ((bucket === 'BCMS' || bucket === 'BC75+') && !applicationUrl) {
      effectiveBucket = bucket === 'BCMS' ? 'GCMS' : 'GCM75+';
      console.warn('[intake/welcome] application URL missing — falling back to non-app template', { leadId, fromBucket: bucket, toBucket: effectiveBucket });
      // Fire-and-forget internal alert. Don't await — we don't want to block
      // the welcome send on this notification.
      try {
        const agentEmailAddr = settings.agentEmail || settings.agent_email;
        if (agentEmailAddr) {
          // Defer import so we don't load the email server module just for
          // the alert path on every welcome send.
          import('@/lib/email.server').then(({ sendEmail }) => {
            sendEmail({
              to: agentEmailAddr,
              subject: 'Action needed: General application URL missing',
              body: `Heads up — ${firstName} just intaked as a ${bucket} lead, but the General rental application URL isn't set in Settings → Integrations yet.\n\nThey got a generic welcome instead of the application-first welcome. Set the URL in Settings and consider sending them the application link manually from their lead page.`,
              kind: 'agent_config_alert',
              internal: true,
              automated: true,
            }).catch(() => {});
          }).catch(() => {});
        }
      } catch {}
    }

    const fill = (s) => String(s || '')
      .replace(/\{firstName\}/g, firstName)
      .replace(/\{moveInDate\}/g, moveInLabel)
      .replace(/\{agentName\}/g, agentName)
      .replace(/\{applicationUrl\}/g, applicationUrl);

    const settingsTemplates = settings.welcomeMessages || settings.welcome_messages || {};
    const t = settingsTemplates[effectiveBucket] || DEFAULT_TEMPLATES[effectiveBucket] || DEFAULT_TEMPLATES.GCMS;
    let smsBody = fill(t.sms);
    let emailSubject = fill(t.emailSubject || t.subject);
    let emailBody = fill(t.email);

    // ---- OPTIONAL AI PERSONALIZATION ----
    // Gated by settings.automation.aiWelcome (default on) AND the master switch.
    const aiOn = settings.automation?.enabled !== false && settings.automation?.aiWelcome !== false;
    if (aiOn) {
      const ai = await aiWelcomeDraft(lead, agentName, applicationUrl);
      if (ai) {
        smsBody = ai.sms;
        emailSubject = ai.emailSubject || emailSubject;
        // NOTE: don't append `— ${agentName}` here. sendEmail() now appends
        // the full settings-driven signature block automatically; manually
        // signing here would double-sign or short-circuit the appender.
        emailBody = `Hi ${firstName},\n\n${ai.email}`;
      }
    }

    // ---- AUTOMATION GATE ----
    // settings.automation.welcomeMessages can turn off welcome sends entirely.
    const welcomeOn =
      settings.automation?.enabled !== false &&
      settings.automation?.welcomeMessages !== false;

    let sentEmail = false;
    let sentSms = false;
    if (welcomeOn) {
      try {
        const r = await sendEmail({
          leadId: lead.id,
          subject: emailSubject,
          body: emailBody,
          kind: 'welcome',
          idempotencyKey: `welcome-email-${lead.id}`,
          automated: true,
        });
        sentEmail = !!r?.ok;
      } catch (err) {
        console.error('[intake/welcome] sendEmail failed', err?.message);
      }
      try {
        const r = await sendSms({
          leadId: lead.id,
          body: smsBody,
          kind: 'welcome',
          idempotencyKey: `welcome-${lead.id}`,
          automated: true,
        });
        sentSms = !!r?.ok;
      } catch (err) {
        console.error('[intake/welcome] sendSms failed', err?.message);
      }
    }

    // ---- AGENT NOTIFICATION ----
    let sentAgentNotif = false;
    if (settings.notifications?.newLeadEmail !== false && agentEmail) {
      try {
        await sendEmail({
          to: agentEmail,
          subject: `New lead: ${lead.full_name} (${bucket})`,
          body:
            `New lead just submitted the intake form.\n\n` +
            `Name: ${lead.full_name}\n` +
            `Email: ${lead.email}\n` +
            `Phone: ${lead.phone}\n` +
            `Budget: $${lead.budget_min} – $${lead.budget_max}/mo\n` +
            `Beds: ${lead.beds}+\n` +
            `Move-in: ${lead.move_in_date}\n` +
            `Areas: ${lead.areas || 'no preference'}\n` +
            `Source: ${lead.raw?.source || 'Unknown'}\n` +
            `Bucket: ${BUCKET_HINTS[bucket] || bucket}\n\n` +
            `Open the CRM: https://rentalsphilly.com/#admin`,
          kind: 'new_lead_alert',
          idempotencyKey: `agent-new-lead-${lead.id}`,
          automated: true,
        });
        sentAgentNotif = true;
      } catch (err) {
        console.warn('[intake/welcome] agent notif failed', err?.message);
      }
    }

    return NextResponse.json({ ok: true, sentEmail, sentSms, sentAgentNotif });
  } catch (err) {
    console.error('[intake/welcome] uncaught', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
