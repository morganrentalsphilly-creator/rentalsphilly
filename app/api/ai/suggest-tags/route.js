// POST /api/ai/suggest-tags
//
// Suggests 2-3 short tags for a lead based on their profile + conversation.
// Tags surface as one-click chips in the lead detail. Constrained to a
// known vocabulary so the agent's tag list stays coherent.
//
// Body: { leadId }
// Returns { ok, tags: string[], reasoning?: string }

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 300;

// Allowed tag vocabulary. Limit to keep the tag list coherent.
const ALLOWED_TAGS = [
  'VIP',
  'Hot lead',
  'Cold',
  'Cosigner needed',
  'Pet owner',
  'Investor',
  'Referral source',
  'Self-employed',
  'Student',
  'Out-of-state',
  'First-time renter',
  'Section 8 / voucher',
  'Roommate situation',
  'Couple',
  'Negotiator',
  'Quick decision',
  'Picky',
];

function buildPrompt(lead, messages) {
  const firstName = (lead.full_name || '').split(' ')[0] || 'them';
  const profile = [
    `Name: ${lead.full_name}`,
    `Stage: ${lead.stage || 'new'}`,
    `Budget: ${lead.budget_min && lead.budget_max ? `$${lead.budget_min}-$${lead.budget_max}/mo` : '?'}`,
    `Beds: ${lead.beds || '?'}`,
    `Move-in: ${lead.move_in_date || 'unspecified'}`,
    `Credit: ${lead.credit_score || lead.raw?.creditScore || '?'}`,
    `Employed: ${lead.employed || lead.raw?.employed || '?'}`,
    `Areas: ${lead.areas || lead.raw?.areas || 'no preference'}`,
    `Source: ${lead.raw?.source || 'Unknown'}`,
    lead.raw?.notes ? `Agent notes: ${lead.raw.notes.slice(0, 300)}` : null,
  ].filter(Boolean).join('\n');

  const convo = messages.slice(-12).map((m) =>
    `${m.direction === 'inbound' ? firstName : 'Me'}: ${(m.body || '').slice(0, 200)}`
  ).join('\n');

  return `You are tagging a real estate lead. Look at their profile + conversation and recommend 2-3 tags from this exact list (no others):
${ALLOWED_TAGS.map((t) => `- ${t}`).join('\n')}

Lead profile:
${profile}

Recent conversation:
${convo || '(no messages yet)'}

Rules:
- Pick ONLY tags from the list above. Spelling must match exactly (including capitalization).
- Be conservative — only tag what's clearly indicated by the data. Don't guess.
- 2-3 tags max. Fewer is fine.

Output STRICTLY as JSON:
{
  "tags": ["...", "..."],
  "reasoning": "..."
}
Where "reasoning" is one short sentence (<= 100 chars) explaining the picks.
Output ONLY the JSON object, no commentary, no code fences.`;
}

export async function POST(request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
    }
    const { leadId } = await request.json();
    if (!leadId) return NextResponse.json({ ok: false, error: 'missing_leadId' }, { status: 400 });

    const db = supabaseAdmin();
    const [leadRes, messagesRes] = await Promise.all([
      db.from('leads').select('*').eq('id', leadId).single(),
      db.from('messages')
        .select('id, direction, body, internal')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
        .limit(40),
    ]);
    if (leadRes.error || !leadRes.data) {
      return NextResponse.json({ ok: false, error: 'lead_not_found' }, { status: 404 });
    }
    const lead = leadRes.data;
    const messages = (messagesRes.data || []).filter((m) => !m.internal);

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
        messages: [{ role: 'user', content: buildPrompt(lead, messages) }],
      }),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      return NextResponse.json(
        { ok: false, error: `claude_api_${apiRes.status}`, detail: errBody.slice(0, 200) },
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
    try { parsed = JSON.parse(cleaned); } catch { return NextResponse.json({ ok: false, error: 'parse_failed' }, { status: 502 }); }
    if (!parsed?.tags || !Array.isArray(parsed.tags)) {
      return NextResponse.json({ ok: false, error: 'missing_tags' }, { status: 502 });
    }
    // Filter to allowed vocabulary
    const cleanTags = parsed.tags
      .map((t) => String(t).trim())
      .filter((t) => ALLOWED_TAGS.includes(t))
      .slice(0, 3);
    return NextResponse.json({
      ok: true,
      tags: cleanTags,
      reasoning: parsed.reasoning || '',
    });
  } catch (err) {
    console.error('[ai/suggest-tags] uncaught', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
