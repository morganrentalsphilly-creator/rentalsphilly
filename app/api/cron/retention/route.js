// Referral cron — past-client touchpoints focused on referrals (not renewals).
//
// Touchpoints:
//   1. 7-21 days post-move-in: thank-you + Google review + referral ask.
//   2. ~12 months post-move-in (anniversary): friendly check-in + referral ask.
//      Past clients are the strongest referral source.
//
// Idempotency: each lead's raw.retention_history tracks which kind we've
// already sent so we don't double-send if the cron fires twice in a day.
//
// Schedule via Vercel cron (add to vercel.json).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSms } from '@/lib/sms.server';

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

// Days between two dates (a after b → positive).
function daysBetween(a, b) {
  return Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

const SEND_CAP = 25; // safety cap per tick

export async function GET(request) {
  if (!authorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const db = supabaseAdmin();

  // Honor the global automation master switch. If it's off, the whole
  // referral / anniversary cron sits quiet.
  const { data: settingsRow } = await db.from('settings').select('automation').eq('id', 1).single();
  if (settingsRow?.automation?.enabled === false) {
    return NextResponse.json({ ok: true, skipped: 'automation master switch off' });
  }

  const { data: leads, error } = await db
    .from('leads')
    .select('id, full_name, phone, move_in_date, opted_out, stage, raw, created_at')
    .in('stage', ['leased', 'paid'])
    .eq('opted_out', false)
    .limit(500);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const today = new Date();
  let sent = 0;
  let errors = 0;
  const log = [];

  for (const lead of (leads || [])) {
    if (sent >= SEND_CAP) break;
    if (!lead.phone) continue;
    if (!lead.move_in_date) continue;
    if (lead.raw?.automation_paused) continue;

    const moveIn = new Date(lead.move_in_date + 'T00:00:00');
    if (Number.isNaN(moveIn.getTime())) continue;

    const daysSinceMoveIn = daysBetween(today, moveIn);
    const yearsSinceMoveIn = Math.floor(daysSinceMoveIn / 365);
    const history = lead.raw?.retention_history || {};
    const firstName = (lead.full_name || '').split(' ')[0] || 'there';

    // Find the next anniversary date. Days remaining = 365 - (daysSinceMoveIn % 365).
    const daysToNextAnniversary = 365 - (daysSinceMoveIn % 365);

    // ---- POST-LEASE REVIEW + REFERRAL ASK ----
    // Fire ~7 days after move-in (lead is settling in, happy). Once per lead.
    // Asks for a Google review and a referral. Stage doesn't matter — leased
    // or paid both qualify. Skipped if move-in is in the future.
    if (daysSinceMoveIn >= 7 && daysSinceMoveIn <= 21 && !history.post_lease_review) {
      const body = `Hi ${firstName} — Morgan from Rentals Philly. Hope move-in is going smoothly! If you have 30 seconds, a quick Google review of how it went would mean a lot. And if you know anyone hunting for a rental in Philly, send 'em my way — I'll take great care of them. Reply STOP to opt out.`;
      try {
        const result = await sendSms({
          leadId: lead.id, body, kind: 'post_lease_review',
          idempotencyKey: `post-lease-review-${lead.id}`,
        });
        if (result.ok) {
          sent++;
          log.push({ id: lead.id, kind: 'post-lease-review' });
          await db.from('leads').update({
            raw: {
              ...(lead.raw || {}),
              retention_history: { ...history, post_lease_review: new Date().toISOString() },
            },
          }).eq('id', lead.id);
        } else { errors++; }
      } catch (err) { errors++; console.error('[retention post-lease]', err); }
      continue;
    }

    // ANNIVERSARY THANK-YOU / REFERRAL ASK: fire on the anniversary itself
    // (within 3 days of the move-in date in any year ≥ 1). Once per year.
    if (yearsSinceMoveIn >= 1 && daysToNextAnniversary <= 3) {
      const annivKey = `anniv-y${yearsSinceMoveIn}`;
      if (!history[annivKey]) {
        const body = `Hi ${firstName} — Morgan from Rentals Philly. Hard to believe it's already been ${yearsSinceMoveIn} year${yearsSinceMoveIn === 1 ? '' : 's'} at your place. Hope it's still feeling like home. If you know anyone hunting for a rental in Philly, I'd be grateful for the intro 🙏`;
        try {
          const result = await sendSms({
            leadId: lead.id, body, kind: 'retention_anniversary',
            idempotencyKey: `${annivKey}-${lead.id}`,
          });
          if (result.ok) {
            sent++;
            log.push({ id: lead.id, kind: 'anniversary', year: yearsSinceMoveIn });
            await db.from('leads').update({
              raw: {
                ...(lead.raw || {}),
                retention_history: { ...history, [annivKey]: new Date().toISOString() },
              },
            }).eq('id', lead.id);
          } else { errors++; }
        } catch (err) { errors++; console.error('[retention anniv]', err); }
      }
    }
  }

  console.log('[cron retention] tick', { sent, errors, log });
  return NextResponse.json({ ok: true, sent, errors, log });
}

export const POST = GET;
