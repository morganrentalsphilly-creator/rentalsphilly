// POST /api/ai/suggest-reply
//
// Body: { leadId }
// Loads lead + recent messages, asks Claude Haiku for a one-paragraph reply draft
// in Morgan's voice. Returns { ok, suggestion, model } or { ok: false, error }.
//
// Why Haiku: fast (~1-2s), cheap (~$0.0001 per call), good enough for short replies.
// Why server-side: we never want the ANTHROPIC_API_KEY in the browser.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 350;

// Pull the most recent N messages (oldest first) so Claude sees the conversation
// flow rather than reversed.
const RECENT_MESSAGES = 12;

function buildSystemPrompt(lead, settings) {
  const agentName = settings?.agent_name || settings?.agentName || 'Morgan';
  const moveIn = lead.move_in_date || lead.raw?.moveInDate || 'unspecified';
  const budget = (lead.budget_min || lead.raw?.budgetMin) && (lead.budget_max || lead.raw?.budgetMax)
    ? `$${lead.budget_min || lead.raw?.budgetMin}–$${lead.budget_max || lead.raw?.budgetMax}/mo`
    : 'unspecified';
  const beds = lead.beds || lead.raw?.beds || 'unspecified';
  const areas = lead.areas || lead.raw?.areas || 'no preference';
  const stage = lead.stage || 'new';
  const credit = lead.credit_score || lead.raw?.creditScore || 'unspecified';
  const picks = Array.isArray(lead.raw?.curated_address_picks)
    ? lead.raw.curated_address_picks
    : [];

  return `You are drafting a reply for ${agentName}, a Philadelphia rental agent at Skale Real Estate. You write the reply IN ${agentName.toUpperCase()}'S VOICE — friendly, professional, concise, never salesy. Most replies are SMS so keep them SHORT (1-3 sentences typical, max ~320 characters). For email replies, 1-2 short paragraphs is fine.

Context about this lead:
- Name: ${lead.full_name || '?'}
- Stage in funnel: ${stage}
- Budget: ${budget}
- Beds: ${beds}
- Preferred areas: ${areas}
- Move-in: ${moveIn}
- Credit (self-reported): ${credit}
${picks.length > 0 ? `- Picked properties: ${picks.slice(0, 5).join('; ')}` : ''}

Guidelines:
- Write ONLY the message body. No greeting like "Dear..." for SMS, just use first name. No sign-off ("Best, Morgan") — that's added separately.
- If the lead asked a specific question, answer it directly.
- If they want to tour, offer to send a scheduling link.
- If they went silent, gently re-engage with one concrete next step.
- If their question requires info you don't have (specific listing details, pricing of a specific unit, exact landlord response), say so honestly and offer to find out.
- Never invent facts about specific listings, landlords, or availability. If unsure, draft a reply that says you'll check and follow up.
- Never use phrases like "I hope this finds you well" or "As per my last message" or other corporate boilerplate.
- DO NOT include placeholders like {firstName} — write the actual name.

Output: just the reply text, nothing else. No explanation, no quotes around it.`;
}

function buildMessageHistory(messages) {
  // Convert lead messages to Claude's message format. Outbound (from Morgan) = assistant.
  // Inbound (from lead) = user. Map subject for email.
  const out = [];
  for (const m of messages) {
    if (m.internal) continue;
    const role = m.direction === 'outbound' ? 'assistant' : 'user';
    let content = m.body || '';
    if (m.subject) content = `[Email subject: ${m.subject}]\n${content}`;
    if (m.channel === 'sms') content = `[SMS] ${content}`;
    if (m.channel === 'email') content = `[Email] ${content}`;
    out.push({ role, content });
  }
  // Claude requires the message list to start with a user turn. If the oldest
  // message in our history is from Morgan (outbound), drop it.
  while (out.length > 0 && out[0].role === 'assistant') out.shift();
  // Also collapse same-role consecutive messages (Claude requires alternation).
  const collapsed = [];
  for (const m of out) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && prev.role === m.role) {
      prev.content += '\n\n' + m.content;
    } else {
      collapsed.push({ ...m });
    }
  }
  // Must end with a user message — that's what we're replying to.
  while (collapsed.length > 0 && collapsed[collapsed.length - 1].role === 'assistant') {
    collapsed.pop();
  }
  return collapsed;
}

export async function POST(request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
    }

    const { leadId } = await request.json();
    if (!leadId) {
      return NextResponse.json({ ok: false, error: 'missing_leadId' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const [leadRes, messagesRes, settingsRes] = await Promise.all([
      db.from('leads').select('*').eq('id', leadId).single(),
      db.from('messages')
        .select('id, lead_id, direction, channel, subject, body, internal, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
        .limit(50),
      db.from('settings').select('*').eq('id', 1).single(),
    ]);

    if (leadRes.error || !leadRes.data) {
      return NextResponse.json({ ok: false, error: 'lead_not_found' }, { status: 404 });
    }

    const lead = leadRes.data;
    const messages = (messagesRes.data || []).slice(-RECENT_MESSAGES);
    const settings = settingsRes.data || {};

    const conversationMessages = buildMessageHistory(messages);
    if (conversationMessages.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'no_inbound_to_reply_to',
      }, { status: 422 });
    }

    const systemPrompt = buildSystemPrompt(lead, settings);

    // Direct fetch — no SDK dep.
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
        system: systemPrompt,
        messages: conversationMessages,
      }),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      console.error('[ai/suggest-reply] claude error', apiRes.status, errBody);
      return NextResponse.json(
        { ok: false, error: `claude_api_${apiRes.status}`, detail: errBody.slice(0, 500) },
        { status: 502 }
      );
    }

    const data = await apiRes.json();
    const suggestion = (data?.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
      .trim();

    if (!suggestion) {
      return NextResponse.json({ ok: false, error: 'empty_response' }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      suggestion,
      model: MODEL,
      usage: data.usage,
    });
  } catch (err) {
    console.error('[ai/suggest-reply] uncaught', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
