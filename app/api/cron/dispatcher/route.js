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
  // Pull a 3-day window starting from YESTERDAY's UTC date. Yesterday catches
  // any late-evening ET tour whose stored `date` is still "today" in ET but
  // already rolled to "tomorrow" in UTC (the cron runs in UTC). The parser
  // below filters to the actual reminder windows, so the wider date range is
  // cheap and bulletproof against TZ rollover.
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const dayAfterStr = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  const { data: tours, error } = await db
    .from('tours')
    .select('id, lead_id, date, time, status, reminders_sent')
    .gte('date', yesterdayStr)
    .lte('date', dayAfterStr);

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
                 (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://rentalsphilly.com');

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
        const { error: flagErr } = await db.from('tours').update({ reminders_sent: next }).eq('id', tour.id);
        if (flagErr) {
          // CRITICAL: if this fails we'll re-fire the same reminder on the
          // next cron tick. Loud-log so it surfaces in Vercel logs.
          console.error('[cron] reminders_sent flag write FAILED — reminder may re-fire', {
            tourId: tour.id, flag: t.flag, error: flagErr.message, code: flagErr.code,
          });
        }
        await sleep(PER_MESSAGE_DELAY_MS);
      } else {
        errors++;
        console.warn('[cron] reminder send failed', { tourId: tour.id, error: result.error });
      }
    }
  }

  return { sent, errors };
}

// Parse a tour's date + time as America/New_York wall-clock and return a Date
// object representing that moment in UTC.
//
// CRITICAL: Tours are stored as separate `date` ('YYYY-MM-DD') and `time`
// ('2:00 PM') columns representing Philadelphia local time — that's what
// Morgan typed when she booked. The previous implementation used
// `new Date(\`${date} ${time}\`)` which parses in the SERVER's local
// timezone. Vercel functions default to UTC, so a 2:00 PM ET tour was being
// treated as 2:00 PM UTC — making the 24h reminder fire 4 hours BEFORE it
// should (or 5h in winter / standard time). Now we explicitly:
//   1. parse the wall-clock components
//   2. compute the EDT/EST offset for that specific date via Intl
//   3. construct the UTC instant the wall-clock corresponds to
function nyOffsetHours(dateStr) {
  // Return how many hours UTC is AHEAD of America/New_York on this date.
  // EDT (DST, ~mid-March to early-Nov) → 4. EST → 5.
  const sample = new Date(`${dateStr}T12:00:00Z`);
  const tz = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).formatToParts(sample).find((p) => p.type === 'timeZoneName')?.value;
  return tz === 'EDT' ? 4 : 5;
}

function parseTourStartsAt(date, time) {
  if (!date || !time) return null;
  const m = String(time).trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  // Build the UTC moment by starting at the date's midnight UTC and adding
  // (wall-clock hour + ET-to-UTC offset). setUTCHours handles day rollover
  // when h + offset goes >= 24.
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(h + nyOffsetHours(date), min, 0, 0);
  return d;
}

async function runBlastDrain(db) {
  // Mark any 'queued' blasts as 'sending' (so the UI updates).
  const { data: queued } = await db
    .from('sms_blasts')
    .select('id, body_template')
    .eq('status', 'queued')
    .limit(5);
  for (const b of (queued || [])) {
    const { error: queueErr } = await db
      .from('sms_blasts')
      .update({ status: 'sending', started_at: new Date().toISOString() })
      .eq('id', b.id);
    if (queueErr) console.error('[cron] sms_blasts queued→sending update FAILED — blast stuck', { blastId: b.id, error: queueErr.message });
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
        const { error: doneErr } = await db.from('sms_blasts').update({
          status: 'done',
          completed_at: new Date().toISOString(),
          ...tally,
        }).eq('id', blast.id);
        if (doneErr) console.error('[cron] sms_blasts mark-done update FAILED — blast stuck in sending', { blastId: blast.id, error: doneErr.message });
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
async function runStageNudges(db, settings) {
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
      // The closure used to reference `lead` from outer scope — but the
      // arrow was defined OUTSIDE the for-of loop that declares `lead`,
      // so it would throw ReferenceError at call time. Now we pass the
      // lead in explicitly. Callers below: rule.message(firstName, lead).
      message: (firstName, lead) =>
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

    // -------------------------------------------------------------------
    // BUCKET-SPECIFIC DRIP CADENCES — added so leads stuck at stage='new'
    // (waiting on application OR waiting for their 75-day window) still
    // hear from us periodically. The principle: "make sure we exist
    // without bombarding." Each cadence fires AT MOST one SMS at a given
    // milestone, gated by nudge_history so it never repeats.
    // -------------------------------------------------------------------

    // 7a-7c. BCMS waiting on application — 3d, 7d, 14d nudges.
    //   Bucket: BCMS, stage: new, no application yet.
    //   These leads are HOT (moving soon) but stalled on the application,
    //   so the cadence is tighter — every few days until either they
    //   submit or hit 14 days, then we go quiet.
    {
      key: 'bcms_app_nudge_3d',
      stage: 'new',
      stuckHours: 72,
      check: (lead) => lead.bucket === 'BCMS'
        && !lead.application
        && !(lead.application_status === 'received' || lead.raw?.application_status === 'received'),
      message: (firstName) => {
        const url = settings?.rentspree_application_url || settings?.raw?.rentspree_application_url || '';
        return url
          ? `Rentals Philly: Hi ${firstName} — quick reminder to fill out the rental application so I can start hunting in your neighborhoods: ${url}\n\nTakes about 10 min. Reply STOP to opt out.`
          : `Rentals Philly: Hi ${firstName} — checking in. Ready to start your Philly rental search? Reply YES and I'll send the application. Reply STOP to opt out.`;
      },
    },
    {
      key: 'bcms_app_nudge_7d',
      stage: 'new',
      stuckHours: 168,
      check: (lead) => lead.bucket === 'BCMS'
        && !lead.application
        && !(lead.application_status === 'received' || lead.raw?.application_status === 'received'),
      message: (firstName) => {
        const url = settings?.rentspree_application_url || settings?.raw?.rentspree_application_url || '';
        return url
          ? `Rentals Philly: Hi ${firstName} — still looking? The Philly rental market moves fast. Once your application's on file I can start picking places that fit. App: ${url}\n\nReply STOP to opt out.`
          : `Rentals Philly: Hi ${firstName} — still looking for a place? Let me know and I'll pick up where we left off. Reply STOP to opt out.`;
      },
    },
    {
      key: 'bcms_app_nudge_14d',
      stage: 'new',
      stuckHours: 336,
      check: (lead) => lead.bucket === 'BCMS'
        && !lead.application
        && !(lead.application_status === 'received' || lead.raw?.application_status === 'received'),
      message: (firstName) => {
        const url = settings?.rentspree_application_url || settings?.raw?.rentspree_application_url || '';
        return url
          ? `Rentals Philly: Hi ${firstName} — last check-in from me. If you're still hunting, the application takes 10 min and unlocks the search: ${url}\n\nOtherwise I'll let you focus. Reply STOP to opt out.`
          : `Rentals Philly: Hi ${firstName} — last check-in. Reply if you'd still like help with your Philly rental search. Reply STOP to opt out.`;
      },
    },

    // 8a-8b. 75+ day leads — light-touch "we exist" check-ins at 30d
    //    and 60d after intake, until the 75-day window opens (at which
    //    point the 75-day task takes over). Gentle cadence so they
    //    remember us when they're ready to act. Applies to BOTH GCM75+
    //    and BC75+ — same copy.
    {
      key: 'longtail_30d_checkin',
      stage: 'new',
      stuckHours: 720,
      check: (lead) => {
        if (lead.bucket !== 'GCM75+' && lead.bucket !== 'BC75+') return false;
        const moveInIso = lead.move_in_date || lead.raw?.moveInDate;
        if (!moveInIso) return false;
        const moveIn = new Date(moveInIso + (moveInIso.length === 10 ? 'T12:00:00' : ''));
        const daysToMove = Math.round((moveIn - new Date()) / 86400000);
        return daysToMove > 75; // only if still in light-touch window
      },
      message: (firstName, lead) => {
        const moveInIso = lead?.move_in_date || lead?.raw?.moveInDate;
        const moveLabel = moveInIso
          ? new Date(moveInIso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long' })
          : 'your move';
        return `Rentals Philly: Hi ${firstName} — just keeping in touch about your ${moveLabel} move. I'll start curating about 75 days before then. Save my number if you have questions. Reply STOP to opt out.`;
      },
    },
    {
      key: 'longtail_60d_checkin',
      stage: 'new',
      stuckHours: 1440,
      check: (lead) => {
        if (lead.bucket !== 'GCM75+' && lead.bucket !== 'BC75+') return false;
        const moveInIso = lead.move_in_date || lead.raw?.moveInDate;
        if (!moveInIso) return false;
        const moveIn = new Date(moveInIso + (moveInIso.length === 10 ? 'T12:00:00' : ''));
        const daysToMove = Math.round((moveIn - new Date()) / 86400000);
        return daysToMove > 75;
      },
      message: (firstName, lead) => {
        const moveInIso = lead?.move_in_date || lead?.raw?.moveInDate;
        const moveIn = moveInIso ? new Date(moveInIso + 'T12:00:00') : null;
        const daysToWindow = moveIn ? Math.round((moveIn - new Date()) / 86400000) - 75 : null;
        return daysToWindow !== null
          ? `Rentals Philly: Hi ${firstName} — checking in. About ${daysToWindow} days until I start sending hand-picked rentals for you. Reach out anytime. Reply STOP to opt out.`
          : `Rentals Philly: Hi ${firstName} — checking in on your Philly rental search. Reach out anytime. Reply STOP to opt out.`;
      },
    },
  ];

  let sent = 0;
  let errors = 0;
  const SEND_CAP = 25;   // safety: don't burst more than 25 nudges per tick

  for (const rule of rules) {
    if (sent >= SEND_CAP) break;
    // SELECT must include every column my rule.check() callbacks read,
    // or the check will silently see `undefined` and never fire.
    // bucket / application / move_in_date are needed by the BCMS-no-app
    // and 75+ light-touch cadences added in the same PR as the column
    // expansion. Without these the new drip rules would be silent no-ops.
    const { data: candidates } = await db
      .from('leads')
      .select('id, full_name, phone, raw, opted_out, stage, created_at, bucket, application, application_status, move_in_date')
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
          // Pass lead in so rules that need lead-specific data (like
          // curated_link_url for the scheduling-link reminder) can access it.
          // Other rule messages just ignore the second arg.
          body: rule.message(firstName, lead),
          idempotencyKey: `nudge-${rule.key}-${lead.id}`,
        });
        if (result.ok) sent++;
        // Mark as nudged regardless of opt-out outcome (we don't want to retry).
        const { error: nudgeFlagErr } = await db.from('leads').update({
          raw: {
            ...(lead.raw || {}),
            nudge_history: { ...history, [rule.key]: new Date().toISOString() },
          },
        }).eq('id', lead.id);
        if (nudgeFlagErr) {
          // If we don't capture this, the same lead gets the same nudge
          // every cron tick until the row finally writes — a brutal UX
          // and a TCPA exposure.
          console.error('[cron] nudge_history write FAILED — nudge may re-fire', {
            leadId: lead.id, rule: rule.key, error: nudgeFlagErr.message, code: nudgeFlagErr.code,
          });
        }
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
  const nudges = nudgesOn ? await runStageNudges(db, settingsRow) : { skipped: 'autoNudgeNoResponse disabled' };
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
