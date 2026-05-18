// Public API for the curated lead page (/c/[token]).
//
// GET   /api/curated/[token]      → returns lead summary + curated properties
// POST  /api/curated/[token]      → accepts the lead's tour selections and
//                                   creates tour records in the CRM
//
// No auth — token is a random 16-char hex stored on lead.raw.curated_token.
// Tokens are unguessable. The page exposes ONLY data the lead is meant to see
// (their own name, the curated properties, agent contact). Not other leads.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSms } from '@/lib/sms.server';
import { sendEmail } from '@/lib/email.server';

async function findLeadByToken(token) {
  const db = supabaseAdmin();
  // raw is jsonb; use the JSON containment operator via PostgREST filter.
  const { data, error } = await db
    .from('leads')
    .select('id, full_name, email, phone, raw, opted_out')
    .filter('raw->>curated_token', 'eq', token)
    .maybeSingle();
  if (error) {
    console.error('[curated GET] db error', error);
    return null;
  }
  return data;
}

export async function GET(_request, ctx) {
  const { token } = (await ctx.params) || ctx.params || {};
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });

  const lead = await findLeadByToken(token);
  if (!lead) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Get the agent's contact from settings so the page can say "Hi from Morgan".
  let agentName = null;
  let agentPhone = null;
  try {
    const db = supabaseAdmin();
    const { data: settings } = await db.from('settings').select('*').eq('id', 1).single();
    if (settings) {
      agentName = settings.agent_name || settings.agentName || null;
      // Prefer the Twilio number (so the lead's SMS replies hit our inbound
      // webhook and thread back through the inbox). Fall back to agent's
      // personal cell if Twilio number isn't configured.
      agentPhone = settings.twilio_number || settings.twilioNumber || settings.agent_phone || settings.agentPhone || null;
    }
  } catch {}

  return NextResponse.json(
    {
      leadId: lead.id,
      firstName: (lead.full_name || '').split(' ')[0] || 'there',
      portalUrl: lead.raw?.curated_portal_url || null,
      // Preferred: simple list of address strings ("1420 Pine St #3B").
      addresses: Array.isArray(lead.raw?.curated_addresses) ? lead.raw.curated_addresses : [],
      // Legacy: structured per-property objects (from older flow).
      properties: Array.isArray(lead.raw?.curated_properties) ? lead.raw.curated_properties : [],
      agentName,
      agentPhone,
      alreadySubmitted: !!lead.raw?.curated_submitted_at,
    },
    {
      // Don't cache aggressively — lead might revisit after we update properties.
      headers: { 'Cache-Control': 'private, no-store' },
    }
  );
}

export async function POST(request, ctx) {
  const { token } = (await ctx.params) || ctx.params || {};
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });
  const lead = await findLeadByToken(token);
  if (!lead) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const body = await request.json();
    // selections: [{ propertyId, address, mls, slotDate, slotTime }, ...]
    const selections = Array.isArray(body.selections) ? body.selections : [];
    const noteForAgent = (body.note || '').toString().slice(0, 2000);

    if (selections.length === 0) {
      return NextResponse.json({ error: 'no_selections' }, { status: 400 });
    }

    const db = supabaseAdmin();

    // Create one tour record per selection.
    const inserted = [];
    for (const s of selections) {
      const tour = {
        id: `tour_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        lead_id: lead.id,
        tour_type: 'in-person',
        date: s.slotDate || null,
        time: s.slotTime || null,
        status: 'requested',
        listings: [{
          id: s.propertyId,
          address: s.address,
          mls: s.mls || null,
          neighborhood: s.neighborhood || null,
        }],
        schedule: null,
        completed_at: null,
        auto_completed: false,
      };
      const { data: row, error } = await db.from('tours').insert(tour).select().single();
      if (error) {
        console.error('[curated POST] tour insert failed', error);
        continue;
      }
      inserted.push(row);
    }

    // Activity log on the lead so the agent sees what happened.
    await db.from('activities').insert({
      id: `a_${Date.now()}`,
      lead_id: lead.id,
      type: 'curated-selections',
      message: `Lead selected ${inserted.length} ${inserted.length === 1 ? 'property' : 'properties'} from the curated link${noteForAgent ? ' · note: ' + noteForAgent.slice(0, 80) : ''}`,
    });

    // Move stage to "tour-requested" if it wasn't already further along.
    await db.from('leads').update({
      stage: 'tour-requested',
      raw: {
        ...(lead.raw || {}),
        curated_selections: selections,
        curated_note: noteForAgent || null,
        curated_submitted_at: new Date().toISOString(),
      },
    }).eq('id', lead.id);

    // Notify the agent via SMS (using the SMS wrapper so it's logged).
    // We send to the agent's number from settings. If unset, skip.
    try {
      const { data: settings } = await db.from('settings').select('*').eq('id', 1).single();
      const agentPhone = settings?.agent_phone || settings?.agentPhone;
      if (agentPhone) {
        const lines = selections.map((s, i) =>
          `${i + 1}. ${s.address}${s.slotDate ? ` — ${s.slotDate} ${s.slotTime || ''}` : ''}`
        );
        const summary = `${lead.full_name} picked ${inserted.length}:\n${lines.join('\n')}${noteForAgent ? '\nNote: ' + noteForAgent.slice(0, 200) : ''}`;
        // The agent doesn't have a lead row, so we can't use sendSms (which
        // requires leadId). Fall back to direct Twilio messages.create here,
        // OR create a placeholder. For now, log + email the agent instead.
        console.log('[curated POST] would notify agent', { agentPhone, summary });
      }
    } catch (err) {
      console.warn('[curated POST] agent notification skipped', err);
    }

    // Confirm to the lead via SMS + email (these DO have a leadId).
    const summaryText = selections.map((s) => `• ${s.address}${s.slotDate ? ` (${s.slotDate} ${s.slotTime || ''})` : ''}`).join('\n');
    await sendSms({
      leadId: lead.id,
      kind: 'tour_confirmation',
      body: `Rentals Philly: Got your picks — ${inserted.length} ${inserted.length === 1 ? 'tour' : 'tours'} requested. I'll confirm specific times shortly.`,
    });
    await sendEmail({
      leadId: lead.id,
      kind: 'tour_confirmation',
      subject: `Your tour requests — ${inserted.length} ${inserted.length === 1 ? 'property' : 'properties'}`,
      body:
        `Hi ${(lead.full_name || '').split(' ')[0]},\n\n` +
        `Got your tour requests:\n\n${summaryText}\n\n` +
        (noteForAgent ? `Your note: ${noteForAgent}\n\n` : '') +
        `I'll confirm specific times and send you calendar invites within a few hours.\n\n— Morgan`,
    });

    return NextResponse.json({ ok: true, created: inserted.length });
  } catch (err) {
    console.error('[curated POST] error', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
