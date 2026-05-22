// POST /api/ai/tour-prep
//
// Body: { leadId }
// Returns a short (2-3 sentence) "here's who you're touring with" briefing
// for the agent. Uses recent messages + lead profile + picked properties to
// write a contextual summary so Morgan walks into each tour informed.
//
// Cheap: Haiku, ~150 max tokens, called on-demand per tour card.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth.server';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 220;
const RECENT_MESSAGES = 8;

function buildPrompt(lead, tour, messages) {
  const firstName = (lead.full_name || '').split(' ')[0] || 'them';
  const addresses = (tour?.listings || []).map((l) => l.address).filter(Boolean).join(', ') || 'unknown address';
  const recent = messages
    .slice(-RECENT_MESSAGES)
    .map((m) => `${m.direction === 'inbound' ? firstName : 'Me'}: ${(m.body || '').slice(0, 200)}`)
    .join('\n');
  const moveIn = lead.move_in_date || lead.raw?.moveInDate;
  const budget = lead.budget_min && lead.budget_max ? `$${lead.budget_min}-$${lead.budget_max}/mo` : '?';
  const beds = lead.beds || '?';
  const credit = lead.credit_score || lead.raw?.creditScore;
  const picks = Array.isArray(lead.raw?.curated_address_picks) ? lead.raw.curated_address_picks : [];
  const notes = lead.raw?.notes || '';

  return `You are briefing a real estate agent on a lead they're about to tour.
Touring at: ${addresses}
Tour time: ${tour.time}

Lead profile:
- Name: ${lead.full_name}
- Budget: ${budget}
- Beds wanted: ${beds}
- Move-in: ${moveIn || 'unspecified'}
- Credit (self-reported): ${credit || 'unspecified'}
${picks.length > 0 ? `- All properties they picked: ${picks.slice(0, 5).join('; ')}` : ''}
${notes ? `- Agent private notes: ${notes.slice(0, 300)}` : ''}

Recent conversation (oldest to newest):
${recent || '(no messages yet)'}

Write a SHORT briefing (2-3 sentences, max ~300 chars) for the agent in this exact format:
- Sentence 1: Who they are (employment/move timeline if known)
- Sentence 2: What they care about most (from the conversation)
- Sentence 3: One thing to mention or be aware of in the tour

Be conversational and useful. No greeting, no header, just the briefing text. Don't invent specifics.`;
}

export async function POST(request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
    }

    const { leadId, tourId } = await request.json();
    if (!leadId) return NextResponse.json({ ok: false, error: 'missing_leadId' }, { status: 400 });

    const db = supabaseAdmin();
    const [leadRes, toursRes, messagesRes] = await Promise.all([
      db.from('leads').select('*').eq('id', leadId).single(),
      db.from('tours').select('*').eq('lead_id', leadId),
      db.from('messages').select('id, direction, body, internal, created_at').eq('lead_id', leadId).order('created_at', { ascending: true }).limit(30),
    ]);

    if (leadRes.error || !leadRes.data) {
      return NextResponse.json({ ok: false, error: 'lead_not_found' }, { status: 404 });
    }
    const lead = leadRes.data;
    const tours = toursRes.data || [];
    const messages = (messagesRes.data || []).filter((m) => !m.internal);
    const tour = tourId
      ? tours.find((t) => t.id === tourId)
      : tours.find((t) => t.status === 'scheduled' || t.status === 'requested' || t.status === 'booked') || tours[0];

    if (!tour) {
      return NextResponse.json({ ok: false, error: 'no_tour' }, { status: 422 });
    }

    const prompt = buildPrompt(lead, tour, messages);

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
    const briefing = (data?.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
      .trim();

    if (!briefing) {
      return NextResponse.json({ ok: false, error: 'empty_response' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, briefing, model: MODEL });
  } catch (err) {
    console.error('[ai/tour-prep] uncaught', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
