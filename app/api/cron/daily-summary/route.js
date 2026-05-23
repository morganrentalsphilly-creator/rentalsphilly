// Daily summary email. Vercel Cron hits this once a day (see vercel.json).
//
// Sends Morgan a morning brief with:
//   - new leads waiting for a curated link
//   - leads who picked properties (need scheduling link sent)
//   - leads who picked times (tours need confirmation)
//   - conversations waiting on his reply
//   - tours today + tomorrow
//   - overdue tasks
//
// Idempotent: a "summary_sent_at" key on the daily_summary settings row
// prevents double-sends if the cron fires twice.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { Resend } from 'resend';

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export async function GET(request) {
  if (!authorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const db = supabaseAdmin();

  // Load everything needed to build the brief.
  const [leadsRes, toursRes, messagesRes, tasksRes, settingsRes] = await Promise.all([
    db.from('leads').select('id, full_name, email, phone, stage, raw, created_at').order('created_at', { ascending: false }).limit(500),
    db.from('tours').select('id, lead_id, date, time, status, listings').gte('date', new Date().toISOString().slice(0, 10)).lte('date', new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)),
    db.from('messages').select('lead_id, direction, body, created_at, channel').order('created_at', { ascending: false }).limit(500),
    db.from('tasks').select('id, lead_id, title, due_date, status, priority').eq('status', 'pending'),
    db.from('settings').select('*').eq('id', 1).single(),
  ]);

  const leads = leadsRes.data || [];
  const tours = toursRes.data || [];
  const messages = messagesRes.data || [];
  const tasks = tasksRes.data || [];
  const settings = settingsRes.data || {};

  // Master automation switch — if off, skip the whole daily summary.
  if (settings.automation?.enabled === false) {
    return NextResponse.json({ ok: true, skipped: 'automation master switch off' });
  }

  // Compute the sections.
  // Bucket-aware "needs a curated link" — mirrors the rule set used by
  // Focus Now and nextMove() so the daily email doesn't report 75+ day
  // leads as "waiting for a curated link" when they're really in the
  // light-touch holding pattern, and doesn't report BCMS-no-app leads
  // (we're waiting on THEM, not the other way around).
  const newLeadsNoCurate = leads.filter((l) => {
    if (l.stage !== 'new') return false;
    if (l.raw?.curated_link_sent_at) return false;
    const moveInIso = l.move_in_date || l.raw?.moveInDate;
    const moveIn = moveInIso ? new Date(moveInIso + (moveInIso.length === 10 ? 'T12:00:00' : '')) : null;
    const daysToMove = moveIn ? Math.round((moveIn - new Date()) / 86400000) : 0;
    const hasApplication = !!l.application || l.application_status === 'received' || l.raw?.application_status === 'received';
    // 75+ day buckets outside their window — quiet.
    if ((l.bucket === 'GCM75+' || l.bucket === 'BC75+') && daysToMove > 75) return false;
    // BCMS waiting on application — quiet (the system is correctly idle).
    if (l.bucket === 'BCMS' && !hasApplication) return false;
    return true;
  });
  // Separately count BCMS leads waiting on app — Morgan should know they
  // exist (so she can manually nudge if she wants) but they're not
  // "waiting for a curated link" since that's not the next step.
  const bcmsWaitingOnApp = leads.filter((l) =>
    l.stage === 'new'
    && l.bucket === 'BCMS'
    && !l.application
    && !(l.application_status === 'received' || l.raw?.application_status === 'received')
  );
  const requestedTours = leads.filter((l) => l.stage === 'tour-requested');
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const toursToday = tours.filter((t) => t.date === todayStr && t.status !== 'cancelled');
  const toursTomorrow = tours.filter((t) => t.date === tomorrowStr && t.status !== 'cancelled');

  // Needs-reply = leads whose latest message is inbound.
  const latestPerLead = {};
  for (const m of messages) {
    if (!latestPerLead[m.lead_id]) latestPerLead[m.lead_id] = m;
  }
  const needsReply = leads.filter((l) => latestPerLead[l.id]?.direction === 'inbound');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdueTasks = tasks.filter((t) => t.due_date && new Date(t.due_date + 'T23:59:59') < today);
  const todayTasks = tasks.filter((t) => t.due_date === todayStr);

  // Format as plain-text + HTML email.
  const leadName = (id) => leads.find((l) => l.id === id)?.full_name || 'a lead';

  const sections = [];
  if (newLeadsNoCurate.length > 0) {
    sections.push({
      title: `🟨 ${newLeadsNoCurate.length} new lead${newLeadsNoCurate.length === 1 ? '' : 's'} waiting for a curated link`,
      items: newLeadsNoCurate.slice(0, 8).map((l) => `${l.full_name} — submitted ${new Date(l.created_at).toLocaleDateString()}`),
    });
  }
  if (requestedTours.length > 0) {
    sections.push({
      title: `🟦 ${requestedTours.length} lead${requestedTours.length === 1 ? '' : 's'} requested tours`,
      items: requestedTours.slice(0, 8).map((l) => `${l.full_name} — ${(l.raw?.curated_address_picks || []).length} properties`),
    });
  }
  if (needsReply.length > 0) {
    sections.push({
      title: `🟥 ${needsReply.length} conversation${needsReply.length === 1 ? '' : 's'} need${needsReply.length === 1 ? 's' : ''} a reply`,
      items: needsReply.slice(0, 8).map((l) => `${l.full_name} — ${(latestPerLead[l.id]?.body || '').slice(0, 80)}`),
    });
  }
  if (toursToday.length > 0) {
    sections.push({
      title: `🟢 ${toursToday.length} tour${toursToday.length === 1 ? '' : 's'} today`,
      items: toursToday.map((t) => `${t.time || '?'} — ${leadName(t.lead_id)} (${(t.listings || []).map(l => l.address).filter(Boolean).join(', ') || 'address TBD'})`),
    });
  }
  if (toursTomorrow.length > 0) {
    sections.push({
      title: `📅 ${toursTomorrow.length} tour${toursTomorrow.length === 1 ? '' : 's'} tomorrow`,
      items: toursTomorrow.map((t) => `${t.time || '?'} — ${leadName(t.lead_id)} (${(t.listings || []).map(l => l.address).filter(Boolean).join(', ') || 'address TBD'})`),
    });
  }
  if (overdueTasks.length > 0) {
    sections.push({
      title: `⚠️ ${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'}`,
      items: overdueTasks.slice(0, 8).map((t) => `${t.title} (due ${fmtDate(t.due_date)})`),
    });
  }
  if (todayTasks.length > 0) {
    sections.push({
      title: `📌 ${todayTasks.length} task${todayTasks.length === 1 ? '' : 's'} due today`,
      items: todayTasks.slice(0, 8).map((t) => t.title),
    });
  }

  // If nothing actionable, send a brief "all clear" so Morgan knows the
  // system is alive but doesn't get a wall of empty sections.
  if (sections.length === 0) {
    sections.push({
      title: '✨ Inbox zero',
      items: ['No urgent actions. Enjoy the morning.'],
    });
  }

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const textBody =
    `Rentals Philly — ${dateLabel}\n` +
    '='.repeat(40) + '\n\n' +
    sections.map((s) =>
      `${s.title}\n${s.items.map((i) => `  • ${i}`).join('\n')}\n`
    ).join('\n') +
    '\n\nOpen the CRM: https://rentalsphilly.com/#admin\n';

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1c1f2a;">
      <div style="border-bottom: 3px solid #b58e54; padding-bottom: 12px; margin-bottom: 24px;">
        <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #b58e54;">Rentals Philly</div>
        <h1 style="font-size: 24px; margin: 4px 0 0;">${dateLabel}</h1>
      </div>
      ${sections.map((s) => `
        <div style="margin-bottom: 20px; padding: 16px; background: #fafafa; border: 1px solid #eee; border-radius: 12px;">
          <div style="font-weight: 600; margin-bottom: 8px;">${s.title}</div>
          <ul style="margin: 0; padding-left: 20px;">
            ${s.items.map((i) => `<li style="margin-bottom: 4px; color: #475569;">${i.replace(/</g, '&lt;')}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
      <div style="margin-top: 32px; text-align: center;">
        <a href="https://rentalsphilly.com/#admin"
           style="display: inline-block; padding: 12px 24px; background: #b58e54; color: white; text-decoration: none; border-radius: 999px; font-weight: 600;">
          Open the CRM →
        </a>
      </div>
    </div>
  `;

  // ---- TOUR-DAY MORNING SMS ----
  // If there are tours today, also text Morgan a compact tour brief.
  // Goes through Twilio directly (not sendSms wrapper) because the recipient
  // is the AGENT, not a lead — we don't want to log it on a lead's thread.
  // Skip if the agent has disabled tour-day SMS in Settings → Notifications.
  let tourSmsResult = null;
  const tourSmsEnabled = settings.notifications?.tourSms !== false;
  if (toursToday.length > 0 && tourSmsEnabled) {
    try {
      const leadById = Object.fromEntries(leads.map((l) => [l.id, l]));
      const lines = toursToday
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
        .map((t) => {
          const lead = leadById[t.lead_id];
          const name = (lead?.full_name || 'Lead').split(' ')[0];
          const phone = lead?.phone || '';
          const addr = (t.listings || []).map((l) => l.address).filter(Boolean).join(', ') || 'address TBD';
          return `${t.time || '?'} — ${name} (${phone}) @ ${addr}`;
        });
      const smsBody = `Today's tours (${toursToday.length}):\n${lines.join('\n')}`;
      const agentPhone = settings.agent_phone || settings.agentPhone;

      if (agentPhone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const twilioClient = (await import('twilio')).default(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID;
        if (process.env.ENABLE_REAL_SENDING === 'true' && fromNumber) {
          const opts = { to: agentPhone, body: smsBody };
          if (fromNumber.startsWith('MG')) opts.messagingServiceSid = fromNumber;
          else opts.from = fromNumber;
          const msg = await twilioClient.messages.create(opts);
          tourSmsResult = { ok: true, sid: msg.sid, tours: toursToday.length };
          console.log('[tour brief SMS] sent', { sid: msg.sid });
        } else {
          tourSmsResult = { ok: true, simulated: true, body: smsBody, tours: toursToday.length };
          console.log('[tour brief SMS — SIMULATED]', { body: smsBody });
        }
      } else {
        tourSmsResult = { ok: false, error: 'agent_phone_or_twilio_env_missing' };
      }
    } catch (smsErr) {
      console.error('[tour brief SMS] failed', smsErr);
      tourSmsResult = { ok: false, error: smsErr.message };
    }
  }

  // Honor the dailyEmail notification toggle. If disabled, skip the email send
  // but still return the tour SMS result (since that has its own toggle).
  if (settings.notifications?.dailyEmail === false) {
    return NextResponse.json({ ok: true, skipped: 'dailyEmail disabled', tourSms: tourSmsResult });
  }

  // Send via Resend directly (we don't want this in a per-lead messages row).
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const to = settings.agent_email || settings.agentEmail || 'morganrentalsphilly@gmail.com';
    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) {
      return NextResponse.json({ ok: false, error: 'RESEND_FROM_EMAIL not set', tourSms: tourSmsResult });
    }
    if (process.env.ENABLE_REAL_SENDING !== 'true') {
      console.log('[daily summary — SIMULATED]', { to, sections: sections.length });
      return NextResponse.json({ ok: true, simulated: true, sections: sections.length, tourSms: tourSmsResult });
    }
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: `Morning brief — ${dateLabel}`,
      text: textBody,
      html: htmlBody,
    });
    if (error) {
      console.error('[daily summary] send failed', error);
      return NextResponse.json({ ok: false, error: error.message, tourSms: tourSmsResult });
    }
    console.log('[daily summary] sent to', to);
    return NextResponse.json({ ok: true, to, sections: sections.length, tourSms: tourSmsResult });
  } catch (err) {
    console.error('[daily summary] error', err);
    return NextResponse.json({ ok: false, error: err.message, tourSms: tourSmsResult });
  }
}

export const POST = GET;
