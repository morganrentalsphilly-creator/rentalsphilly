// POST /api/ai/lead-summary
//
// Returns a 2-3 sentence "where this lead stands" briefing for the agent.
// Reads the lead profile + recent messages + recent activities and asks
// Claude Haiku for a short status update. Used by the Lead Detail overview
// to give Morgan instant context when re-opening a lead after a break.
//
// Cached on the client per (leadId × last-message-id) so it doesn't burn
// API calls every time he opens the same lead.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth.server';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 220;
const RECENT_MESSAGES = 10;
const RECENT_ACTIVITIES = 8;

function buildPrompt(lead, messages, activities) {
  const firstName = (lead.full_name || '').split(' ')[0] || 'them';
  const budget = lead.budget_min && lead.budget_max ? `$${lead.budget_min}-$${lead.budget_max}/mo` : '?';
  const stage = lead.stage || 'new';
  const moveIn = lead.move_in_date || lead.raw?.moveInDate || 'unspecified';
  const credit = lead.credit_score || lead.raw?.creditScore;
  const picks = Array.isArray(lead.raw?.curated_address_picks) ? lead.raw.curated_address_picks : [];
  const notes = lead.raw?.notes || '';
  const ageDays = lead.created_at ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000) : null;

  const recent = messages.slice(-RECENT_MESSAGES).map((m) => {
    const who = m.direction === 'inbound' ? firstName : 'Me';
    return `${who}: ${(m.body || '').slice(0, 180)}`;
  }).join('\n');

  const recentActs = activities.slice(-RECENT_ACTIVITIES).map((a) =>
    `${a.type}: ${a.message || ''}`
  ).join('\n');

  return `You are summarizing a lead's status for Morgan, a real estate agent.

Lead profile:
- Name: ${lead.full_name}
- Stage: ${stage}
- Budget: ${budget}
- Beds: ${lead.beds || '?'}
- Move-in: ${moveIn}
- Credit (self-reported): ${credit || 'unspecified'}
- Source: ${lead.raw?.source || 'Unknown'}
- Age as a lead: ${ageDays !== null ? `${ageDays} days` : 'unknown'}
${picks.length > 0 ? `- Properties they picked: ${picks.slice(0, 5).join('; ')}` : ''}
${notes ? `- Agent private notes: ${notes.slice(0, 300)}` : ''}

Recent activity (oldest to newest):
${recentActs || '(none)'}

Recent messages (oldest to newest):
${recent || '(no messages)'}

Write a SHORT 2-3 sentence status summary (max ~280 chars) Morgan can read in 5 seconds when he opens this lead. Format:
- Sentence 1: Where they are in the funnel + one defining characteristic.
- Sentence 2: What's the most recent thing that happened.
- Sentence 3 (optional): What the next move should be.

Be specific (use real names, addresses, dates from context). No greeting, no header, no quotes around the summary. Don't invent facts.`;
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
    const [leadRes, messagesRes, activitiesRes] = await Promise.all([
      db.from('leads').select('*').eq('id', leadId).single(),
      db.from('messages')
        .select('id, direction, body, internal, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
        .limit(40),
      db.from('activities')
        .select('id, type, message, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
        .limit(30),
    ]);

    if (leadRes.error || !leadRes.data) {
      return NextResponse.json({ ok: false, error: 'lead_not_found' }, { status: 404 });
    }
    const lead = leadRes.data;
    const messages = (messagesRes.data || []).filter((m) => !m.internal);
    const activities = activitiesRes.data || [];

    const prompt = buildPrompt(lead, messages, activities);

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
    const summary = (data?.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
      .trim();

    if (!summary) {
      return NextResponse.json({ ok: false, error: 'empty_response' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, summary, model: MODEL });
  } catch (err) {
    console.error('[ai/lead-summary] uncaught', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
