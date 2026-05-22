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

// Pull system templates from settings — fall back to hardcoded defaults
// if the row is missing or the field is empty (so a partial settings save
// doesn't break reminders).
const DEFAULT_SYSTEM_TEMPLATES = {
  reminder24h: `Rentals Philly: Reminder, {firstName} — your showing is tomorrow at {tourTime}. Need to reschedule? Tap {rescheduleUrl}. Reply STOP to opt out.`,
  reminder1h: `Rentals Philly: Heads up {firstName} — your showing is in about an hour ({tourTime}). See you soon!`,
};
function fillTpl(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

async function runReminders(db) {
  const now = new Date();
  const in23h45m = new Date(now.getTime() + (24 * 60 - 15) * 60 * 1000);
  const in24h15m = new Date(now.getTime() + (24 * 60 + 15) * 60 * 1000);
  const in45m    = new Date(now.getTime() + 45 * 60 * 1000);
  const in75m    = new Date(now.getTime() + 75 * 60 * 1000);

  // Load agent-editable reminder templates (Settings → Templates).
  // Accept either camelCase OR snake_case column (the settings table has
  // both styles historically) so this works regardless.
  const { data: settings } = await db.from('settings').select('*').eq('id', 1).single();
  const stored = settings?.systemTemplates || settings?.system_templates || {};
  const tpls = { ...DEFAULT_SYSTEM_TEMPLATES, ...stored };

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

  // Build a lookup of lead → (firstName, curated_token) so we can substitute
  // those tokens into reminder bodies (for personalization + reschedule URLs).
  const leadIds = (tours || []).map((t) => t.lead_id).filter(Boolean);
  let leadById = {};
  if (leadIds.length > 0) {
    const { data: leads } = await db
      .from('leads')
      .select('id, full_name, raw')
      .in('id', leadIds);
    leadById = Object.fromEntries((leads || []).map((l) => [l.id, l]));
  }

  // Build the public app URL once (used in reschedule links).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
                 (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://rentalsphilly.vercel.app');

  let sent = 0;
  let errors = 0;
  for (const tour of (tours || [])) {
    if (tour.status === 'cancelled' || tour.status === 'completed') continue;
    if (!tour.lead_id) continue;
    const startsAt = parseTourStartsAt(tour.date, tour.time);
    if (!startsAt) continue;

    // Resolve substitution vars per tour
    const lead = leadById[tour.lead_id];
    // Skip reminders for leads with per-lead automation paused.
    if (lead?.raw?.automation_paused) continue;
    const firstName = ((lead?.full_name || '').split(' ')[0]) || 'there';
    const leadToken = lead?.raw?.curated_token || '';
    const rescheduleUrl = leadToken ? `${appUrl}/c/${leadToken}?reschedule=${tour.id}` : '';
    const tourDate = (() => {
      try {
        return new Date(tour.date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        });
      } catch { return tour.date; }
    })();
    const vars = {
      firstName,
      tourTime: tour.time,
      tourDate,
      tourId: tour.id,
      leadToken,
      rescheduleUrl,
    };

    const reminders = tour.reminders_sent || {};
    const tasks = [];
    if (startsAt >= in23h45m && startsAt <= in24h15m && !reminders.day_before) {
      tasks.push({ flag: 'day_before', kind: 'reminder_24hr',
        body: fillTpl(tpls.reminder24h, vars) });
    }
    if (startsAt >= in45m && startsAt <= in75m && !reminders.hour_before) {
      tasks.push({ flag: 'hour_before', kind: 'reminder_1hr',
        body: fillTpl(tpls.reminder1h, vars) });
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

// Per-stage nudge engine. Finds leads stuck in a given stage past the
// cooldown and fires the appropriate re-engagement message. Idempotent via
// lead.raw.nudge_history (keyed by stage+rule so we don't re-nudge).
async function runStageNudges(db) {
  const now = new Date();
  const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000);

  // The rule set. Each rule: which stage, how long stuck (hours), what to send.
  const rules = [
    // 1. Lead got the curated link but hasn't picked properties after 48h
    {
      key: 'matched_48h_no_pick',
      stage: 'matched',
      stuckHours: 48,
      check: (lead) => !lead.raw?.curated_submitted_at,
      message: (firstName) =>
        `Rentals Philly: Hey ${firstName} — any of those rentals catch your eye? Reply with the ones you want to tour and I'll set it up.`,
    },
    // 2. Lead picked properties but agent hasn't sent scheduling link in 24h
    //    (this nudges the AGENT via activity log — surfaces in Today cards).
    //    Implemented passively — the Inbox card already shows requested tours.
    //    No SMS needed here.
    // 3. Scheduling link sent but lead hasn't picked times in 48h
    {
      key: 'scheduling_48h_no_pick',
      stage: 'tour-requested',
      stuckHours: 48,
      check: (lead) => lead.raw?.scheduling_open_at && !lead.raw?.times_submitted_at,
      message: (firstName) =>
        `Rentals Philly: Hey ${firstName} — just a reminder, you can still pick tour times here: ${lead?.raw?.curated_link_url || '[link]'}`,
    },
    // 4. Post-tour silent at 48h
    {
      key: 'post_tour_48h',
      stage: 'post-tour',
      stuckHours: 48,
      check: () => true,
      message: (firstName) =>
        `Rentals Philly: Hey ${firstName}, any favorites from the tour? Happy to put together an application if so.`,
    },
    // 5. Post-tour silent at 5 days
    {
      key: 'post_tour_5d',
      stage: 'post-tour',
      stuckHours: 120,
      check: () => true,
      message: (firstName) =>
        `Rentals Philly: Want me to send a fresh batch of rentals, ${firstName}? Things move fast — happy to refine the search.`,
    },
    // 6. Applied but no decision in 7 days — nudge the AGENT (no SMS)
    //    Implemented passively via the auto-task created on stage change.
  ];

  let sent = 0;
  let errors = 0;
  const SEND_CAP = 25;   // safety: don't burst more than 25 nudges per tick

  for (const rule of rules) {
    if (sent >= SEND_CAP) break;
    const { data: candidates } = await db
      .from('leads')
      .select('id, full_name, phone, raw, opted_out, stage, created_at')
      .eq('stage', rule.stage)
      .eq('opted_out', false)
      .limit(50);

    for (const lead of (candidates || [])) {
      if (sent >= SEND_CAP) break;
      // Skip leads with per-lead automation paused OR active snooze.
      if (lead.raw?.automation_paused) continue;
      const snoozeUntil = lead.raw?.snoozed_until;
      if (snoozeUntil && new Date(snoozeUntil) > new Date()) continue;
      // Check stuck time — use latest of stage entry hints we have.
      const stageEnteredAt = new Date(
        lead.raw?.curated_link_sent_at ||
        lead.raw?.curated_submitted_at ||
        lead.raw?.scheduling_open_at ||
        lead.created_at
      );
      if (stageEnteredAt > hoursAgo(rule.stuckHours)) continue;
      if (!rule.check(lead)) continue;
      const history = lead.raw?.nudge_history || {};
      if (history[rule.key]) continue;   // already nudged for this rule

      try {
        const firstName = (lead.full_name || '').split(' ')[0] || 'there';
        const result = await sendSms({
          leadId: lead.id,
          kind: 'nudge_48hr',
          body: rule.message(firstName),
          idempotencyKey: `nudge-${rule.key}-${lead.id}`,
        });
        if (result.ok) sent++;
        // Mark as nudged regardless of opt-out outcome (we don't want to retry).
        await db.from('leads').update({
          raw: {
            ...(lead.raw || {}),
            nudge_history: { ...history, [rule.key]: new Date().toISOString() },
          },
        }).eq('id', lead.id);
        await sleep(PER_MESSAGE_DELAY_MS);
      } catch (err) {
        console.error('[cron stage nudge] failed', { leadId: lead.id, rule: rule.key, err: err.message });
        errors++;
      }
    }
  }

  return { sent, errors };
}

// Tour-outcome prompt creator. ~75 minutes after a scheduled tour's end time,
// if the agent hasn't marked an outcome (status still scheduled / requested /
// booked / confirmed), create a one-tap task: "Mark outcome of tour at X".
// Idempotent — uses tour.id in the task ID prefix so we don't double-create.
async function runTourOutcomePrompts(db) {
  const now = new Date();
  // Look at tours from the last 2 days (covers anything we may have missed).
  const since = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const { data: tours, error } = await db
    .from('tours')
    .select('id, lead_id, date, time, status, listings')
    .gte('date', since)
    .lte('date', today);
  if (error) {
    console.error('[cron tour-outcome] query failed', error);
    return { created: 0, errors: 1 };
  }

  let created = 0;
  let errors = 0;
  for (const tour of (tours || [])) {
    // Skip closed states — already actioned.
    if (['cancelled', 'completed', 'showed', 'no-show'].includes(tour.status)) continue;
    if (!tour.lead_id) continue;
    const startsAt = parseTourStartsAt(tour.date, tour.time);
    if (!startsAt) continue;
    // Trigger 75 minutes after tour start (which is ~15 min after a typical 60-min tour ends).
    const triggerAt = startsAt.getTime() + 75 * 60 * 1000;
    if (now.getTime() < triggerAt) continue;
    // Idempotency: did we already create a prompt task for this tour?
    const taskId = `t_${tour.id}_outcome`;
    const { data: existing } = await db.from('tasks').select('id').eq('id', taskId).maybeSingle();
    if (existing) continue;
    const firstAddr = (tour.listings || []).map((l) => l.address).filter(Boolean)[0] || 'the property';
    try {
      await db.from('tasks').insert({
        id: taskId,
        lead_id: tour.lead_id,
        title: `Mark outcome of tour at ${firstAddr}`,
        due_date: today,
        status: 'pending',
        priority: 'high',
        auto: true,
        flags: ['tour-outcome'],
        related_tour_id: tour.id,
      });
      await db.from('activities').insert({
        id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        lead_id: tour.lead_id,
        type: 'tour-outcome-prompted',
        message: `Auto-task created: mark outcome of tour at ${firstAddr}`,
      });
      created++;
    } catch (err) {
      console.error('[cron tour-outcome] insert failed', { tourId: tour.id, err: err.message });
      errors++;
    }
  }
  return { created, errors };
}

export async function GET(request) {
  if (!authorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const db = supabaseAdmin();

  // Read the global automation toggles from settings. Each toggle short-circuits
  // the corresponding sub-task. The master switch (`automation.enabled`) bails
  // out of everything at once — useful as an emergency "pause everything" stop.
  // Outbound transactional sends like blast drain still flow because those are
  // user-initiated, not automated nudges. Default is "enabled" if the setting
  // hasn't been written yet (back-compat with installs predating these toggles).
  // SELECT * (not 'automation, raw') so we don't blow up if a column hasn't
  // been added yet — see migrations 0004 + 0005. The heartbeat write below
  // is already wrapped in try/catch, so a missing `raw` column degrades to
  // "no heartbeat" rather than crashing the whole cron run.
  const { data: settingsRow } = await db.from('settings').select('*').eq('id', 1).single();
  const auto = settingsRow?.automation || {};
  const automationOn = auto.enabled !== false;
  const remindersOn = automationOn && auto.tourReminders !== false;
  const nudgesOn = automationOn && auto.autoNudgeNoResponse !== false;
  const autoCompleteOn = automationOn && auto.autoCompleteTours !== false;

  const reminders = remindersOn ? await runReminders(db) : { skipped: 'tourReminders disabled' };
  const blast = await runBlastDrain(db);
  const nudges = nudgesOn ? await runStageNudges(db) : { skipped: 'autoNudgeNoResponse disabled' };
  const tourOutcomes = autoCompleteOn ? await runTourOutcomePrompts(db) : { skipped: 'autoCompleteTours disabled' };

  // Heartbeat — stash the tick timestamp + last-run summary into settings.raw
  // so /api/health can confirm the cron is actually firing. If this stops
  // updating, the dispatcher has died and you need to investigate Vercel cron.
  try {
    await db.from('settings').update({
      raw: {
        ...(settingsRow?.raw || {}),
        last_cron_tick: new Date().toISOString(),
        last_cron_summary: {
          reminders: reminders?.sent ?? reminders?.skipped ?? 0,
          nudges: nudges?.sent ?? nudges?.skipped ?? 0,
          tour_outcomes: tourOutcomes?.created ?? tourOutcomes?.skipped ?? 0,
          blast: blast?.sent ?? 0,
        },
      },
    }).eq('id', 1);
  } catch (heartbeatErr) {
    console.warn('[cron] heartbeat write failed', heartbeatErr?.message);
  }

  console.log('[cron] dispatcher tick', { automationOn, reminders, blast, nudges, tourOutcomes });
  return NextResponse.json({ ok: true, automationOn, reminders, blast, nudges, tourOutcomes });
}

// Allow POST too so it's easy to test from curl with a bearer header.
export const POST = GET;
