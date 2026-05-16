// Cron dispatcher. Vercel Cron hits this every minute (see vercel.json).
//
// Two jobs run on each tick:
//   1. Tour reminders — find tours starting in ~24h or ~1h that haven't been
//      reminded yet, fire the SMS, flip the flag in tours.reminders_sent.
//   2. Bulk SMS drain — for each blast in 'queued' or 'sending' status,
//      pull up to BLAST_BATCH_PER_TICK pending recipients and send them,
//      pacing at PER_MESSAGE_DELAY_MS to respect A2P 10DLC throughput.
//
// Authorization: Vercel Cron sends an Authorization header signed with
// CRON_SECRET. We refuse anything else.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSms } from '@/lib/sms.server';

// Throughput knobs. A2P 10DLC sole-prop starts at ~1 segment/sec. We pace at
// 1100ms to be safe and process at most BLAST_BATCH_PER_TICK per minute.
const PER_MESSAGE_DELAY_MS = 1100;
const BLAST_BATCH_PER_TICK = 25;       // 25 messages/minute = under the throttle
const REMINDER_BATCH_PER_TICK = 50;

function authorized(request) {
  // Allow when called manually with CRON_SECRET in dev, or when Vercel Cron
  // calls with its bearer token.
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runReminders(db) {
  const now = new Date();
  const in23h45m = new Date(now.getTime() + (24 * 60 - 15) * 60 * 1000);
  const in24h15m = new Date(now.getTime() + (24 * 60 + 15) * 60 * 1000);
  const in45m    = new Date(now.getTime() + 45 * 60 * 1000);
  const in75m    = new Date(now.getTime() + 75 * 60 * 1000);

  // 24-hour reminders
  // Tour rows have separate `date` (yyyy-mm-dd) and `time` columns based on
  // the page code, so we compute a starts_at on the fly via a SQL expression.
  // Simpler: pull a generous slice of upcoming tours and filter in JS.
  const { data: tours, error } = await db
    .from('tours')
    .select('id, lead_id, date, time, status, reminders_sent')
    .gte('date', now.toISOString().slice(0, 10))
    .lte('date', new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10));

  if (error) {
    console.error('[cron] reminder query failed', error);
    return { sent: 0, errors: 1 };
  }

  let sent = 0;
  let errors = 0;
  for (const tour of (tours || [])) {
    if (tour.status === 'cancelled' || tour.status === 'completed') continue;
    if (!tour.lead_id) continue;
    const startsAt = parseTourStartsAt(tour.date, tour.time);
    if (!startsAt) continue;

    const reminders = tour.reminders_sent || {};
    const tasks = [];
    if (startsAt >= in23h45m && startsAt <= in24h15m && !reminders.day_before) {
      tasks.push({ flag: 'day_before', kind: 'reminder_24hr',
        body: `Reminder: your showing is tomorrow at ${tour.time}. Reply if you need to reschedule.` });
    }
    if (startsAt >= in45m && startsAt <= in75m && !reminders.hour_before) {
      tasks.push({ flag: 'hour_before', kind: 'reminder_1hr',
        body: `Heads up — your showing is in about an hour (${tour.time}). See you soon!` });
    }

    for (const t of tasks) {
      if (sent >= REMINDER_BATCH_PER_TICK) break;
      const result = await sendSms({
        leadId: tour.lead_id,
        body: t.body,
        kind: t.kind,
        idempotencyKey: `tour-${tour.id}-${t.flag}`,
      });
      if (result.ok) {
        sent++;
        const next = { ...reminders, [t.flag]: new Date().toISOString() };
        await db.from('tours').update({ reminders_sent: next }).eq('id', tour.id);
        await sleep(PER_MESSAGE_DELAY_MS);
      } else {
        errors++;
        console.warn('[cron] reminder send failed', { tourId: tour.id, error: result.error });
      }
    }
  }

  return { sent, errors };
}

function parseTourStartsAt(date, time) {
  if (!date || !time) return null;
  // time is like "2:00 PM" — combine with date.
  try {
    const d = new Date(`${date} ${time}`);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

async function runBlastDrain(db) {
  // Mark any 'queued' blasts as 'sending' (so the UI updates).
  const { data: queued } = await db
    .from('sms_blasts')
    .select('id, body_template')
    .eq('status', 'queued')
    .limit(5);
  for (const b of (queued || [])) {
    await db
      .from('sms_blasts')
      .update({ status: 'sending', started_at: new Date().toISOString() })
      .eq('id', b.id);
  }

  // Drain active blasts.
  const { data: active } = await db
    .from('sms_blasts')
    .select('id, body_template')
    .eq('status', 'sending')
    .limit(5);

  let totalSent = 0;
  let totalFailed = 0;

  for (const blast of (active || [])) {
    if (totalSent >= BLAST_BATCH_PER_TICK) break;

    const remaining = BLAST_BATCH_PER_TICK - totalSent;
    const { data: pending } = await db
      .from('sms_blast_recipients')
      .select('id, lead_id, status')
      .eq('blast_id', blast.id)
      .eq('status', 'pending')
      .limit(remaining);

    if (!pending || pending.length === 0) {
      // Nothing pending → check if this blast is fully done.
      const { count: leftover } = await db
        .from('sms_blast_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('blast_id', blast.id)
        .eq('status', 'pending');
      if ((leftover || 0) === 0) {
        // Aggregate counts and mark done.
        const { data: rows } = await db
          .from('sms_blast_recipients')
          .select('status')
          .eq('blast_id', blast.id);
        const tally = {
          sent_count: 0, failed_count: 0, opted_out_count: 0,
        };
        for (const r of (rows || [])) {
          if (r.status === 'sent') tally.sent_count++;
          else if (r.status === 'failed') tally.failed_count++;
          else if (r.status === 'opted_out') tally.opted_out_count++;
        }
        await db.from('sms_blasts').update({
          status: 'done',
          completed_at: new Date().toISOString(),
          ...tally,
        }).eq('id', blast.id);
      }
      continue;
    }

    for (const rcpt of pending) {
      // Personalize {firstName} from the lead.
      const { data: lead } = await db
        .from('leads')
        .select('full_name')
        .eq('id', rcpt.lead_id)
        .single();
      const firstName = (lead?.full_name || '').split(' ')[0] || 'there';
      const body = blast.body_template.replace(/\{firstName\}/g, firstName);

      const result = await sendSms({
        leadId: rcpt.lead_id,
        body,
        kind: 'blast',
        idempotencyKey: `blast-${blast.id}-${rcpt.lead_id}`,
        blastRecipientId: rcpt.id,
      });
      if (result.ok) totalSent++; else totalFailed++;

      await sleep(PER_MESSAGE_DELAY_MS);
      if (totalSent >= BLAST_BATCH_PER_TICK) break;
    }
  }

  return { sent: totalSent, failed: totalFailed };
}

export async function GET(request) {
  if (!authorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const db = supabaseAdmin();
  const reminders = await runReminders(db);
  const blast = await runBlastDrain(db);
  console.log('[cron] dispatcher tick', { reminders, blast });
  return NextResponse.json({ ok: true, reminders, blast });
}

// Allow POST too so it's easy to test from curl with a bearer header.
export const POST = GET;
