// POST /api/ai/next-action
//
// Asks Claude what the SINGLE best next move is for a lead, given their
// current stage, recent messages, tour history, and time since last touch.
//
// Returns { ok, action, reason, suggestedMessage? } where:
//   action.type    one of: 'send-sms', 'send-email', 'send-curated-link',
//                  'send-scheduling-link', 'mark-stage', 'wait', 'mark-lost',
//                  'request-application'
//   action.label   short button label
//   reason         1-sentence "why this" explanation
//   suggestedMessage  optional pre-drafted SMS body if action.type involves
//                  sending a text — so it's one-tap execute.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth.server';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 400;

function buildPrompt(lead, messages) {
  const firstName = (lead.full_name || '').split(' ')[0] || 'them';
  const stage = lead.stage || 'new';
  const budget = lead.budget_min && lead.budget_max ? `$${lead.budget_min}-$${lead.budget_max}/mo` : '?';
  const moveIn = lead.move_in_date || lead.raw?.moveInDate || 'unspecified';
  // Bucket drives the workflow but is NEVER shown to the customer. We pass it
  // to the AI for routing only — see the "NEVER mention credit" guardrail in
  // the constraints block below.
  const bucket = lead.bucket || 'unknown';
  const picks = Array.isArray(lead.raw?.curated_address_picks) ? lead.raw.curated_address_picks : [];
  const curatedSent = !!lead.raw?.curated_link_sent_at;
  const schedulingOpen = !!lead.raw?.scheduling_open_at;
  const tourCount = Array.isArray(lead.tours) ? lead.tours.length : 0;
  // Application gate signals: for BCMS leads we wait on the application
  // before doing any curation. Both an uploaded PDF (`application` jsonb) or
  // a "marked received via RentSpree" flag clear the gate.
  const hasApplication = !!lead.application || !!lead.raw?.application;
  const applicationMarkedReceived = lead.application_status === 'received' || lead.raw?.application_status === 'received';
  const applicationClear = hasApplication || applicationMarkedReceived;
  const lastMsg = messages[messages.length - 1];
  const lastMsgAge = lastMsg ? Math.floor((Date.now() - new Date(lastMsg.timestamp || lastMsg.created_at).getTime()) / 86400000) : null;
  const lastMsgDir = lastMsg?.direction;
  const lastMsgBody = (lastMsg?.body || '').slice(0, 200);
  const conversation = messages.slice(-8).map((m) => {
    const who = m.direction === 'inbound' ? firstName : 'Me';
    return `${who}: ${(m.body || '').slice(0, 160)}`;
  }).join('\n');

  // Bucket-specific workflow hint so the AI doesn't have to infer it.
  const bucketHint = {
    GCMS:   'Moving soon. Hand-pick rentals now → send curated link → scheduling link → tour.',
    'GCM75+': 'Moving 75+ days out. Light-touch until ~75 days before move-in, then curate.',
    BCMS:   'Moving soon. MUST receive completed application BEFORE we start curating. If app not on file yet, nudge for it.',
    'BC75+':  'Moving 75+ days out. Will send application link ~75 days before move-in. Light-touch until then.',
  }[bucket] || '';

  return `You're helping a Philadelphia rental agent decide the single best next action for a lead. Recommend ONE concrete move — not a list.

Lead state:
- Name: ${lead.full_name}
- Stage: ${stage}
- Bucket: ${bucket} ${bucketHint ? `(${bucketHint})` : ''}
- Budget: ${budget}
- Move-in: ${moveIn}
- Application on file: ${applicationClear ? 'yes' : 'no'}
- Curated link sent: ${curatedSent ? 'yes' : 'no'}
- Scheduling link sent: ${schedulingOpen ? 'yes' : 'no'}
- Properties picked: ${picks.length}
- Tours scheduled: ${tourCount}
- Last message: ${lastMsg ? `${lastMsgDir} (${lastMsgAge}d ago): "${lastMsgBody}"` : 'no messages yet'}

Recent conversation:
${conversation || '(no messages yet)'}

Decide on ONE action from this list (pick the most impactful right now):
- "send-sms"               — text them with a draft you provide
- "send-email"             — email them with a draft
- "send-curated-link"      — agent needs to curate + send the MLS portal link
- "send-scheduling-link"   — they've picked properties; now send them the time picker
- "request-application"    — BCMS gate: nudge them to fill out the application link we already sent (or send it if missed)
- "mark-stage"             — advance the stage (specify which)
- "mark-lost"              — they've gone cold, mark lost
- "wait"                   — nothing to do right now, let cron handle the cadence

Output STRICTLY as JSON:
{
  "action": { "type": "...", "label": "..." },
  "reason": "...",
  "suggestedMessage": "..." (optional — only if action involves sending an SMS)
}

Constraints:
- "label" should be a 2-5 word button label like "Send curated link" or "Text Alex re: tour interest"
- "reason" is one sentence (<= 120 chars) explaining why this is the move now
- "suggestedMessage" if present should be SMS-length (<= 280 chars), brand-prefixed "Rentals Philly:", end with "Reply STOP to opt out"
- For "wait", reason should explain what we're waiting on
- NEVER mention credit, credit score, credit profile, financial situation, or anything similar in "suggestedMessage" or "reason" — this is product policy. Bucket is a private workflow signal.
- Output ONLY the JSON object, no commentary, no code fences.`;
}

export async function POST(request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
    }

    const { leadId } = await request.json();
    if (!leadId) return NextResponse.json({ ok: false, error: 'missing_leadId' }, { status: 400 });

    const db = supabaseAdmin();
    const [leadRes, messagesRes, toursRes] = await Promise.all([
      db.from('leads').select('*').eq('id', leadId).single(),
      db.from('messages')
        .select('id, direction, body, internal, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
        .limit(30),
      db.from('tours').select('id, date, time, status').eq('lead_id', leadId),
    ]);

    if (leadRes.error || !leadRes.data) {
      return NextResponse.json({ ok: false, error: 'lead_not_found' }, { status: 404 });
    }

    const lead = leadRes.data;
    lead.tours = toursRes.data || [];
    const messages = (messagesRes.data || []).filter((m) => !m.internal);

    const prompt = buildPrompt(lead, messages);
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
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch (e) {
      return NextResponse.json({ ok: false, error: 'parse_failed', raw: cleaned.slice(0, 300) }, { status: 502 });
    }
    if (!parsed?.action?.type) {
      return NextResponse.json({ ok: false, error: 'missing_action', parsed }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ...parsed });
  } catch (err) {
    console.error('[ai/next-action] uncaught', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
