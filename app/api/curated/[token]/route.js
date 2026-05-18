// Public API for the curated lead page (/c/[token]).
//
// TWO PHASES of the workflow share the same token + URL:
//
//   Phase 1: lead picks properties (addresses + note)
//   Phase 2: agent reviews → clicks "Send scheduling link" → SMS goes out →
//            lead returns to same /c/[token] which now shows time slots
//
// GET   /api/curated/[token]    → returns lead summary + phase state
// POST  /api/curated/[token]    → routes to phase 1 (properties) or phase 2
//                                 (times) based on `phase` field in body

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSms } from '@/lib/sms.server';
import { sendEmail } from '@/lib/email.server';

async function findLeadByToken(token) {
  const db = supabaseAdmin();
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

function phaseFor(lead) {
  if (lead.raw?.times_submitted_at) return 3;     // done
  if (lead.raw?.scheduling_open_at) return 2;     // agent enabled time picker
  if (lead.raw?.curated_submitted_at) return 'awaiting-scheduling';
  return 1;                                       // initial — pick properties
}

export async function GET(_request, ctx) {
  const { token } = (await ctx.params) || ctx.params || {};
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });

  const lead = await findLeadByToken(token);
  if (!lead) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let agentName = null;
  let agentPhone = null;
  try {
    const db = supabaseAdmin();
    const { data: settings } = await db.from('settings').select('*').eq('id', 1).single();
    if (settings) {
      agentName = settings.agent_name || settings.agentName || null;
      agentPhone = settings.twilio_number || settings.twilioNumber || settings.agent_phone || settings.agentPhone || null;
    }
  } catch {}

  return NextResponse.json(
    {
      leadId: lead.id,
      firstName: (lead.full_name || '').split(' ')[0] || 'there',
      portalUrl: lead.raw?.curated_portal_url || null,
      phase: phaseFor(lead),
      // Phase 1 output (lead's chosen addresses + note)
      selectedAddresses: Array.isArray(lead.raw?.curated_address_picks) ? lead.raw.curated_address_picks : [],
      curatedNote: lead.raw?.curated_note || null,
      // Phase 2 output (lead's chosen times)
      pickedTimes: Array.isArray(lead.raw?.picked_times) ? lead.raw.picked_times : [],
      agentName,
      agentPhone,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export async function POST(request, ctx) {
  const { token } = (await ctx.params) || ctx.params || {};
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });
  const lead = await findLeadByToken(token);
  if (!lead) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const body = await request.json();
    const phase = body.phase || (Array.isArray(body.times) ? 2 : 1);
    const db = supabaseAdmin();

    if (phase === 1) {
      // === PHASE 1: lead is telling us which properties they want ===
      const addresses = (Array.isArray(body.addresses) ? body.addresses : [])
        .map((s) => String(s).trim())
        .filter(Boolean);
      const note = (body.note || '').toString().slice(0, 2000);

      if (addresses.length === 0) {
        return NextResponse.json({ error: 'no_addresses' }, { status: 400 });
      }

      await db.from('leads').update({
        stage: 'tour-requested',
        raw: {
          ...(lead.raw || {}),
          curated_address_picks: addresses,
          curated_note: note || null,
          curated_submitted_at: new Date().toISOString(),
        },
      }).eq('id', lead.id);

      await db.from('activities').insert({
        id: `a_${Date.now()}`,
        lead_id: lead.id,
        type: 'curated-properties-picked',
        message: `Lead picked ${addresses.length} ${addresses.length === 1 ? 'property' : 'properties'}: ${addresses.slice(0, 3).join(', ')}${addresses.length > 3 ? ` +${addresses.length - 3} more` : ''}${note ? ' · Note: ' + note.slice(0, 80) : ''}`,
      });

      // Confirm to the lead so they know we got it.
      await sendSms({
        leadId: lead.id,
        kind: 'manual',
        body: `Rentals Philly: Got your picks (${addresses.length}). I'll review availability and send you a scheduling link with open times shortly.`,
      });

      return NextResponse.json({ ok: true, phase: 'awaiting-scheduling' });
    }

    if (phase === 2) {
      // === PHASE 2: lead is picking times for each property ===
      // Body shape: { picks: [{ address, slotDate, slotTime }, ...], note? }
      const picks = Array.isArray(body.picks) ? body.picks : [];
      const note = (body.note || '').toString().slice(0, 2000);

      if (picks.length === 0) {
        return NextResponse.json({ error: 'no_picks' }, { status: 400 });
      }

      const inserted = [];
      for (const p of picks) {
        if (!p.address || !p.slotDate || !p.slotTime) continue;
        const tour = {
          id: `tour_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          lead_id: lead.id,
          tour_type: 'in-person',
          date: p.slotDate,
          time: p.slotTime,
          status: 'requested',
          listings: [{ address: p.address }],
          schedule: null,
          completed_at: null,
          auto_completed: false,
        };
        const { data: row, error } = await db.from('tours').insert(tour).select().single();
        if (error) {
          console.error('[curated POST phase 2] tour insert failed', error);
          continue;
        }
        inserted.push(row);
      }

      await db.from('leads').update({
        stage: 'tour-booked',
        raw: {
          ...(lead.raw || {}),
          picked_times: picks,
          times_submitted_at: new Date().toISOString(),
        },
      }).eq('id', lead.id);

      await db.from('activities').insert({
        id: `a_${Date.now()}`,
        lead_id: lead.id,
        type: 'tour-times-picked',
        message: `Lead picked ${inserted.length} tour ${inserted.length === 1 ? 'time' : 'times'}${note ? ' · Note: ' + note.slice(0, 80) : ''}`,
      });

      // Confirm to lead.
      const summary = picks.map((p) => `• ${p.address} — ${p.slotDate} ${p.slotTime}`).join('\n');
      await sendSms({
        leadId: lead.id,
        kind: 'tour_confirmation',
        body: `Rentals Philly: Got your tour times. I'll confirm shortly with calendar invites.`,
      });
      await sendEmail({
        leadId: lead.id,
        kind: 'tour_confirmation',
        subject: `Your tour requests`,
        body:
          `Hi ${(lead.full_name || '').split(' ')[0]},\n\n` +
          `Got your tour requests:\n\n${summary}\n\n` +
          `I'll confirm specific times and send calendar invites shortly.\n\n— Morgan`,
      });

      return NextResponse.json({ ok: true, created: inserted.length });
    }

    return NextResponse.json({ error: 'invalid_phase' }, { status: 400 });
  } catch (err) {
    console.error('[curated POST] error', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
