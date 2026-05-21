// Weekly recap email cron. Runs Sundays at 22 UTC (= 6pm ET / 5pm CT).
//
// Emails Morgan a recap of the last 7 days: leads added, tours run,
// applications submitted, leases signed, commission booked. Includes a
// week-over-week comparison so trends are visible.
//
// Honors settings.notifications.weeklyRecap — if it's explicitly false,
// the email is skipped (but the route still returns 200 so Vercel doesn't
// retry-storm).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { Resend } from 'resend';
import { htmlShell } from '@/lib/email-templates';

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

const DAY_MS = 86400000;

function dateAgo(days) {
  return new Date(Date.now() - days * DAY_MS);
}

function within(date, fromMs, toMs) {
  const t = new Date(date).getTime();
  return t >= fromMs && t < toMs;
}

function pctDelta(current, prior) {
  if (!prior && !current) return { sign: '', text: 'no change' };
  if (!prior) return { sign: 'up', text: 'new' };
  const delta = ((current - prior) / prior) * 100;
  if (Math.abs(delta) < 1) return { sign: '', text: 'no change' };
  return {
    sign: delta > 0 ? 'up' : 'down',
    text: `${delta > 0 ? '+' : ''}${Math.round(delta)}% vs last week`,
  };
}

export async function GET(request) {
  if (!authorized(request)) return new NextResponse('Unauthorized', { status: 401 });

  const db = supabaseAdmin();
  const now = Date.now();
  const thisWeekStart = now - 7 * DAY_MS;
  const priorWeekStart = now - 14 * DAY_MS;

  const [leadsRes, toursRes, settingsRes] = await Promise.all([
    db.from('leads').select('id, full_name, stage, bucket, created_at, raw').gte('created_at', new Date(priorWeekStart).toISOString()),
    db.from('tours').select('id, lead_id, date, status, completed_at, listings, created_at').gte('created_at', new Date(priorWeekStart).toISOString()),
    db.from('settings').select('*').eq('id', 1).single(),
  ]);

  const settings = settingsRes.data || {};
  if (settings.notifications?.weeklyRecap === false) {
    return NextResponse.json({ ok: true, skipped: 'weekly recap disabled in settings' });
  }

  const leads = leadsRes.data || [];
  const tours = toursRes.data || [];

  // Bucket events into this-week vs. prior-week windows.
  const newLeadsThis = leads.filter((l) => within(l.created_at, thisWeekStart, now));
  const newLeadsPrior = leads.filter((l) => within(l.created_at, priorWeekStart, thisWeekStart));

  const toursThis = tours.filter((t) => within(t.completed_at || t.date, thisWeekStart, now));
  const toursPrior = tours.filter((t) => within(t.completed_at || t.date, priorWeekStart, thisWeekStart));
  const toursShowedThis = toursThis.filter((t) => t.status === 'completed' || t.status === 'showed');
  const toursShowedPrior = toursPrior.filter((t) => t.status === 'completed' || t.status === 'showed');

  // Pull submissions from each lead's raw.submissions if present
  // (submissions live on the leads row in raw, per the current schema).
  const subsThis = [];
  const subsPrior = [];
  const leasedThis = leads.filter((l) => {
    const ts = l.raw?.leased_at;
    return ts && within(ts, thisWeekStart, now);
  });
  const leasedPrior = leads.filter((l) => {
    const ts = l.raw?.leased_at;
    return ts && within(ts, priorWeekStart, thisWeekStart);
  });

  let commissionThis = 0;
  let commissionPrior = 0;
  for (const l of leads) {
    const amt = Number(l.raw?.commission?.amount || 0);
    if (!amt) continue;
    const ts = l.raw?.commission?.received_at || l.raw?.leased_at;
    if (!ts) continue;
    if (within(ts, thisWeekStart, now)) commissionThis += amt;
    else if (within(ts, priorWeekStart, thisWeekStart)) commissionPrior += amt;
  }

  const fmt = (n) => new Intl.NumberFormat('en-US').format(n);
  const fmt$ = (n) => `$${new Intl.NumberFormat('en-US').format(Math.round(n))}`;

  const stats = [
    { label: 'New leads',          value: newLeadsThis.length,      prior: newLeadsPrior.length },
    { label: 'Tours scheduled',    value: toursThis.length,         prior: toursPrior.length },
    { label: 'Tours completed',    value: toursShowedThis.length,   prior: toursShowedPrior.length },
    { label: 'Leases signed',      value: leasedThis.length,        prior: leasedPrior.length },
    { label: 'Commission booked',  value: commissionThis,           prior: commissionPrior, dollar: true },
  ];

  const rowsHtml = stats.map((s) => {
    const d = pctDelta(s.value, s.prior);
    const color = d.sign === 'up' ? '#047857' : d.sign === 'down' ? '#b91c1c' : '#94a3b8';
    return `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#475569;">${s.label}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;font-size:18px;font-weight:700;text-align:right;color:#1c1f2a;font-variant-numeric:tabular-nums;">${s.dollar ? fmt$(s.value) : fmt(s.value)}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;font-size:11px;text-align:right;color:${color};white-space:nowrap;">${d.text}</td>
      </tr>
    `;
  }).join('');

  const weekLabel = `Week of ${new Date(thisWeekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(now - DAY_MS).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  // ---- AI coach: get 2-3 actionable observations on this week's performance ----
  // Pulls the same stats + a sense of cadence (avg reply time, touched leads,
  // stuck-deal count) and asks Claude for short focused coaching.
  let coachNotes = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      // Compute supporting context the AI will reference.
      const stuckCount = leads.filter((l) => {
        const stage = l.stage;
        if (['leased', 'paid', 'lost', 'archived'].includes(stage)) return false;
        // Use last activity to detect "stuck"
        const created = new Date(l.created_at).getTime();
        const lastChange = (l.raw?.last_stage_change_at) ? new Date(l.raw.last_stage_change_at).getTime() : created;
        return now - lastChange > 7 * DAY_MS;
      }).length;
      const conversionRate = newLeadsThis.length > 0
        ? Math.round((leasedThis.length / newLeadsThis.length) * 100)
        : null;

      const prompt = `You are a real estate sales coach reviewing one week of a Philly rental agent's activity. Give 2-3 SHORT, SPECIFIC, actionable observations.

This week's numbers:
- New leads: ${newLeadsThis.length} (prior week: ${newLeadsPrior.length})
- Tours scheduled: ${toursThis.length} (prior: ${toursPrior.length})
- Tours completed: ${toursShowedThis.length} (prior: ${toursShowedPrior.length})
- Leases signed: ${leasedThis.length} (prior: ${leasedPrior.length})
- Commission booked: $${commissionThis} (prior: $${commissionPrior})
- Currently stuck in pipeline >7d: ${stuckCount}
${conversionRate !== null ? `- Lead→lease conversion this week: ${conversionRate}%` : ''}

Format your response as a JSON array of 2-3 objects, each shaped:
{ "headline": "...", "body": "...", "tone": "good" | "watch" | "act" }
- headline: short bold takeaway (4-8 words)
- body: 1-2 sentence specific observation + recommended action
- tone: "good" if it's a win to keep doing, "watch" if it's a trend to monitor, "act" if there's a concrete next step

Output ONLY the JSON array, no commentary, no code fences. Be specific and direct, not generic.`;

      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (apiRes.ok) {
        const apiData = await apiRes.json();
        const raw = (apiData?.content || [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n')
          .trim();
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
        try {
          const arr = JSON.parse(cleaned);
          if (Array.isArray(arr) && arr.length > 0) coachNotes = arr;
        } catch {}
      }
    } catch (err) {
      console.warn('[weekly recap] coach AI failed', err?.message);
    }
  }

  const toneStyles = {
    good:  { bg: '#ecfdf5', border: '#10b981', label: 'WIN',   labelColor: '#047857' },
    watch: { bg: '#fffbeb', border: '#f59e0b', label: 'WATCH', labelColor: '#b45309' },
    act:   { bg: '#fef2f2', border: '#ef4444', label: 'ACT',   labelColor: '#b91c1c' },
  };
  const coachHtml = coachNotes && coachNotes.length > 0 ? `
    <div style="margin:0 0 22px;">
      <p style="margin:0 0 10px;font-size:15px;color:#1c1f2a;font-weight:700;">📋 Coach&rsquo;s notes</p>
      ${coachNotes.map((note) => {
        const t = toneStyles[note.tone] || toneStyles.watch;
        return `
          <div style="margin-bottom:8px;padding:12px 14px;background:${t.bg};border-left:3px solid ${t.border};border-radius:8px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;color:${t.labelColor};margin-bottom:3px;">${t.label}</div>
            <div style="font-size:14px;font-weight:600;color:#1c1f2a;margin-bottom:3px;">${(note.headline || '').replace(/</g, '&lt;')}</div>
            <div style="font-size:13px;color:#475569;line-height:1.5;">${(note.body || '').replace(/</g, '&lt;')}</div>
          </div>
        `;
      }).join('')}
    </div>
  ` : '';

  const body = `
    <p style="margin:0 0 14px;font-size:17px;color:#1c1f2a;font-weight:600;">Your week in numbers</p>
    <p style="margin:0 0 18px;color:#64748b;font-size:13px;">${weekLabel}</p>
    ${coachHtml}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      ${rowsHtml}
    </table>
    <p style="margin:18px 0 6px;font-size:13px;color:#64748b;">See the full funnel and stage-time breakdowns:</p>
    <p style="margin:0 0 14px;"><a href="https://rentalsphilly.vercel.app/#admin" style="color:#b58e54;text-decoration:underline;">Open Analytics →</a></p>
  `;
  const html = htmlShell({ body, preheader: weekLabel });

  const textBody =
    `Rentals Philly weekly recap\n${weekLabel}\n\n` +
    stats.map((s) => {
      const d = pctDelta(s.value, s.prior);
      const val = s.dollar ? fmt$(s.value) : fmt(s.value);
      return `${s.label}: ${val} (${d.text})`;
    }).join('\n') +
    '\n\nFull analytics: https://rentalsphilly.vercel.app/#admin';

  // Send via Resend.
  try {
    const to = settings.agent_email || settings.agentEmail || 'morganrentalsphilly@gmail.com';
    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) {
      return NextResponse.json({ ok: false, error: 'RESEND_FROM_EMAIL not set', stats });
    }
    if (process.env.ENABLE_REAL_SENDING !== 'true') {
      console.log('[weekly recap — SIMULATED]', { to, stats });
      return NextResponse.json({ ok: true, simulated: true, stats });
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: `Weekly recap — ${weekLabel}`,
      text: textBody,
      html,
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message });
    }
    return NextResponse.json({ ok: true, to, stats });
  } catch (err) {
    console.error('[weekly recap] error', err);
    return NextResponse.json({ ok: false, error: err.message });
  }
}

export const POST = GET;
