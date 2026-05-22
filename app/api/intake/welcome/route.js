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
async function aiWelcomeDraft(lead, agentName) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const firstName = (lead.full_name || '').split(' ')[0] || 'there';
  const budget = lead.budget_min && lead.budget_max ? `$${lead.budget_min}-$${lead.budget_max}/mo` : null;
  const beds = lead.beds === '0' ? 'studio' : (lead.beds ? `${lead.beds}+ bed` : null);
  const areas = lead.areas || null;
  const moveIn = lead.move_in_date ? new Date(lead.move_in_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null;
  const bucket = lead.bucket || '';
  const isSoon = bucket === 'GCMS' || bucket === 'BCMS';
  const isGoodCredit = bucket === 'GCMS' || bucket === 'GCM75+';

  const profile = [
    firstName ? `Name: ${firstName}` : null,
    budget ? `Budget: ${budget}` : null,
    beds ? `Wants: ${beds}` : null,
    areas ? `Neighborhoods: ${areas}` : null,
    moveIn ? `Move-in: ${moveIn}` : null,
    `Credit profile: ${isGoodCredit ? 'good (650+)' : 'limited (<650)'}`,
    `Move timeline: ${isSoon ? 'soon (next ~75 days)' : 'further out (75+ days)'}`,
  ].filter(Boolean).join('\n');

  const strategyNote = isSoon
    ? 'They are moving SOON. We will hand-pick rentals immediately and send a personalized link soon.'
    : 'They are moving LATER. We will reach out about 75 days before their move-in date with hand-picked options. Until then, light touch.';
  const creditNote = isGoodCredit
    ? ''
    : 'Their credit is limited — be supportive, mention we work across credit profiles, and that flexible buildings, cosigners, and alternate deposit structures can help.';

  const prompt = `You are ${agentName || 'Morgan'}, a Philadelphia rental agent. A new lead just submitted your intake form. Write a personalized welcome SMS AND a personalized welcome email referencing their actual criteria — not a generic template.

Lead profile:
${profile}

Strategy: ${strategyNote}
${creditNote}

Output STRICTLY as JSON with three fields:
{
  "sms": "...",
  "emailSubject": "...",
  "email": "..."
}

Constraints:
- SMS: <= 280 chars. Start with "Rentals Philly:" so they know who it's from. Reference 1-2 specifics (their neighborhood, budget, or timing). End with "Reply STOP to opt out." End the SMS itself; no signature.
- emailSubject: <= 60 chars. Conversational, references their specific situation.
- email: 3-5 short sentences (body only — no "Hi {name}" since we add the greeting separately, no sign-off since we add the signature). Warm, specific, acknowledges what they're looking for, sets expectations for what happens next.
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
const DEFAULT_TEMPLATES = {
  GCMS: {
    sms: `Rentals Philly: Got it, {firstName} — I'm hand-picking rentals for you now. You'll get a personalized link with photos soon. Reply STOP to opt out.`,
    emailSubject: `Hand-picked Philly rentals — incoming`,
    email: `Hi {firstName},\n\nThanks for reaching out. Since you're moving soon, I'm prioritizing your search — I'll hand-pick rentals that match what you described and send you a personalized link.\n\nWhen the link arrives, tap through to view photos and tell me which ones you'd like to tour. I'll handle the scheduling from there.\n\nTalk soon,\n— {agentName}`,
  },
  BCMS: {
    sms: `Rentals Philly: Got it, {firstName} — I'll come back soon with options. I work with all credit profiles. Reply STOP to opt out.`,
    emailSubject: `Welcome to Rentals Philly — let's find the right fit`,
    email: `Hi {firstName},\n\nThanks for reaching out. I work with renters across all credit profiles, and there are good options out there — landlords with flexible criteria, units that accept cosigners, and alternate deposit structures that can unlock more buildings.\n\nGive me a bit and I'll come back with a hand-picked list that fits your situation. We'll talk through any cosigner or deposit options if they help.\n\nTalk soon,\n— {agentName}`,
  },
  'GCM75+': {
    sms: `Rentals Philly: Thanks {firstName}! Since your move is further out, I'll reach out about 75 days before {moveInDate} with hand-picked rentals. Save my number for the meantime. Reply STOP to opt out.`,
    emailSubject: `Got you on the calendar for {moveInDate}`,
    email: `Hi {firstName},\n\nThanks for letting me know what you're looking for. Since your move-in is further out, I'll start curating about 75 days before {moveInDate}. That's when listings for your window will actually be on the market.\n\nIn the meantime, save my contact — if your timeline shifts or you have questions, text me anytime.\n\n— {agentName}`,
  },
  'BC75+': {
    sms: `Rentals Philly: Thanks {firstName}! I'll reach out about 75 days before {moveInDate}. If you can work on credit in the meantime, it opens up more options. Save my number. Reply STOP to opt out.`,
    emailSubject: `Planning ahead for {moveInDate}`,
    email: `Hi {firstName},\n\nThanks for reaching out. Since your move is further out, I'll plan to come back to you about 75 days before {moveInDate} with hand-picked rentals.\n\nOne thing to think about between now and then: any progress on your credit will widen the range of buildings available to you. Even getting current on a card or paying down a small balance can make a real difference.\n\nIf your timeline shifts or you have questions, text me anytime.\n\n— {agentName}`,
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
    // 2) Welcome must not already be in flight / sent. Check for an existing
    //    welcome SMS row for this lead.
    const { data: existing } = await db
      .from('messages')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('kind', 'welcome')
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, alreadySent: true });
    }

    // ---- BUILD TEMPLATES (with fallback chain: settings.welcomeMessages → DEFAULT_TEMPLATES) ----
    const bucket = lead.bucket || 'GCMS';
    const firstName = (lead.full_name || '').split(' ')[0] || 'there';
    const moveInLabel = lead.move_in_date ? new Date(lead.move_in_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'your move date';
    const agentName = settings.agentName || settings.agent_name || 'Morgan';
    const agentEmail = settings.agentEmail || settings.agent_email;
    const fill = (s) => String(s || '')
      .replace(/\{firstName\}/g, firstName)
      .replace(/\{moveInDate\}/g, moveInLabel)
      .replace(/\{agentName\}/g, agentName);

    const settingsTemplates = settings.welcomeMessages || settings.welcome_messages || {};
    const t = settingsTemplates[bucket] || DEFAULT_TEMPLATES[bucket] || DEFAULT_TEMPLATES.GCMS;
    let smsBody = fill(t.sms);
    let emailSubject = fill(t.emailSubject || t.subject);
    let emailBody = fill(t.email);

    // ---- OPTIONAL AI PERSONALIZATION ----
    // Gated by settings.automation.aiWelcome (default on) AND the master switch.
    const aiOn = settings.automation?.enabled !== false && settings.automation?.aiWelcome !== false;
    if (aiOn) {
      const ai = await aiWelcomeDraft(lead, agentName);
      if (ai) {
        smsBody = ai.sms;
        emailSubject = ai.emailSubject || emailSubject;
        emailBody = `Hi ${firstName},\n\n${ai.email}\n\n— ${agentName}`;
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
            `Open the CRM: https://rentalsphilly.vercel.app/#admin`,
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
