// POST /api/ai/welcome-draft
//
// Drafts a personalized welcome SMS + email for a brand-new lead, referencing
// their actual criteria (areas, budget, move-in date, credit, tour type).
// Designed to replace static bucket templates with something more human.
//
// Body: { leadId }
// Returns { ok, sms, emailSubject, email } or { ok: false, error }
//
// Falls back to {} on any error — caller should treat empty values as
// "use the static template instead" rather than crash the welcome flow.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth.server';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 600;

function buildPrompt(lead, agentName) {
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

  return `You are ${agentName || 'Morgan'}, a Philadelphia rental agent. A new lead just submitted your intake form. Write a personalized welcome SMS AND a personalized welcome email referencing their actual criteria — not a generic template.

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
}

export async function POST(request) {
  try {
    // Admin-only. Public intake welcome flow lives at /api/intake/welcome,
    // which uses the same Claude prompt server-side without an HTTP hop.
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
    }

    const { leadId } = await request.json();
    if (!leadId) return NextResponse.json({ ok: false, error: 'missing_leadId' }, { status: 400 });

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
    const agentName = settings.agentName || settings.agent_name || 'Morgan';

    const prompt = buildPrompt(lead, agentName);

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      return NextResponse.json(
        { ok: false, error: `claude_api_${apiRes.status}`, detail: errBody.slice(0, 300) },
        { status: 502 }
      );
    }

    const data = await apiRes.json();
    const raw = (data?.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
      .trim();

    // Claude sometimes wraps the JSON in code fences despite instructions —
    // strip them defensively.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      return NextResponse.json({ ok: false, error: 'parse_failed', raw: cleaned.slice(0, 300) }, { status: 502 });
    }

    if (!parsed?.sms || !parsed?.email || !parsed?.emailSubject) {
      return NextResponse.json({ ok: false, error: 'missing_fields', parsed }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      sms: String(parsed.sms).slice(0, 480),                  // hard cap
      emailSubject: String(parsed.emailSubject).slice(0, 120),
      email: String(parsed.email).slice(0, 4000),
      model: MODEL,
    });
  } catch (err) {
    console.error('[ai/welcome-draft] uncaught', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
