// POST /api/curated/[token]/reschedule
//
// Lead-initiated tour reschedule. Body: { tourId, slotDate, slotTime }.
// Validates the token, finds the tour, updates date/time, logs an activity,
// clears prior reminders_sent flags so new ones fire for the new time,
// and notifies the agent + the lead by SMS.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSms } from '@/lib/sms.server';

async function findLeadByToken(token) {
  const db = supabaseAdmin();
  const { data } = await db
    .from('leads')
    .select('id, full_name, phone, raw, opted_out')
    .filter('raw->>curated_token', 'eq', token)
    .maybeSingle();
  return data;
}

export async function POST(request, ctx) {
  try {
    const { token } = (await ctx.params) || ctx.params || {};
    if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });
    const lead = await findLeadByToken(token);
    if (!lead) return NextResponse.json({ error: 'lead_not_found' }, { status: 404 });

    const { tourId, slotDate, slotTime } = await request.json();
    if (!tourId || !slotDate || !slotTime) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: tour, error: tourErr } = await db
      .from('tours')
      .select('id, lead_id, date, time, status, listings')
      .eq('id', tourId)
      .single();
    if (tourErr || !tour) {
      return NextResponse.json({ error: 'tour_not_found' }, { status: 404 });
    }
    if (tour.lead_id !== lead.id) {
      // Token doesn't own this tour.
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (tour.status === 'cancelled' || tour.status === 'completed' || tour.status === 'no-show') {
      return NextResponse.json({ error: 'tour_closed' }, { status: 422 });
    }

    const oldDate = tour.date;
    const oldTime = tour.time;

    const { error: updErr } = await db.from('tours').update({
      date: slotDate,
      time: slotTime,
      status: 'requested',         // back to "requested" so agent re-confirms
      reminders_sent: {},          // re-arm reminders for the new time
    }).eq('id', tour.id);
    if (updErr) {
      console.error('[reschedule] update failed', updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Log activity
    const firstAddr = (tour.listings || []).map((l) => l.address).filter(Boolean)[0] || 'their tour';
    const { error: reschedActErr } = await db.from('activities').insert({
      // Random suffix — activities.id is the PK; same-ms collisions across
      // leads would silently lose an activity row.
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      lead_id: lead.id,
      type: 'tour-rescheduled',
      message: `Lead rescheduled ${firstAddr} from ${oldDate} ${oldTime} → ${slotDate} ${slotTime}`,
    });
    if (reschedActErr) console.error('[reschedule] activity insert FAILED', { leadId: lead.id, error: reschedActErr.message });

    // Confirm to the lead by SMS.
    await sendSms({
      leadId: lead.id,
      kind: 'tour_reschedule_confirm',
      idempotencyKey: `resched-${tour.id}-${slotDate}-${slotTime.replace(/[:\s]/g, '')}`,
      body: `Rentals Philly: Got it — your tour is rescheduled to ${slotDate} at ${slotTime}. We'll confirm shortly.`,
    });

    return NextResponse.json({ ok: true, tour: { id: tour.id, date: slotDate, time: slotTime } });
  } catch (err) {
    console.error('[reschedule] error', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
