// Live iCalendar feed of all upcoming tours.
//
// Subscribe URL (the agent uses this once in their calendar app):
//   https://rentalsphilly.vercel.app/api/calendar/feed?token=XXX
//
// In Apple Calendar:  File → New Calendar Subscription → paste the URL
// In Google Calendar: Settings → Add calendar → From URL → paste the URL
//
// Authentication: the token must match settings.calendar_feed_token. We
// auto-generate one the first time it's missing.

import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth.server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function escapeIcs(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function pad(n) { return String(n).padStart(2, '0'); }
function fmtUtc(d) {
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
    'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
}

// Parse a tour date+time as America/New_York wall-clock → returns UTC Date.
//
// CRITICAL: tours are stored as `date` ('YYYY-MM-DD') + `time` ('2:00 PM')
// representing Philadelphia local time. The previous implementation used
// `new Date(date + 'T00:00:00').setHours(...)` which interprets in the
// SERVER's local TZ — Vercel runs in UTC by default, so a 2:00 PM ET tour
// showed up in Morgan's phone calendar as 10:00 AM ET (4-hour shift in DST).
function nyOffsetHours(dateStr) {
  // Hours UTC is ahead of America/New_York on this date. EDT → 4, EST → 5.
  const sample = new Date(`${dateStr}T12:00:00Z`);
  const tz = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).formatToParts(sample).find((p) => p.type === 'timeZoneName')?.value;
  return tz === 'EDT' ? 4 : 5;
}

function parseStart(date, time) {
  if (!date || !time) return null;
  const m = String(time).trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(h + nyOffsetHours(date), min, 0, 0);
  return d;
}

export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response('Missing token. Use the subscribe URL from Settings.', { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: settings } = await db.from('settings').select('*').eq('id', 1).single();
  const expected = settings?.calendar_feed_token || settings?.raw?.calendar_feed_token;
  if (!expected || token !== expected) {
    return new Response('Invalid token', { status: 403 });
  }

  // Pull all non-cancelled tours from 60 days ago through 365 days ahead, so
  // recent + future tours are visible (recent for trip-back-through history).
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const ahead = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const [toursRes, leadsRes] = await Promise.all([
    db.from('tours').select('id, lead_id, date, time, status, listings').gte('date', since).lte('date', ahead),
    db.from('leads').select('id, full_name, phone'),
  ]);
  const tours = (toursRes.data || []).filter((t) => t.status !== 'cancelled');
  const leadsById = Object.fromEntries((leadsRes.data || []).map((l) => [l.id, l]));

  const events = tours.map((t) => {
    const start = parseStart(t.date, t.time);
    if (!start) return null;
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const lead = leadsById[t.lead_id] || {};
    const addrs = (t.listings || []).map((l) => l.address).filter(Boolean);
    const summary = `Tour: ${lead.full_name || 'Lead'}${addrs[0] ? ` @ ${addrs[0].split(',')[0]}` : ''}`;
    const description = [
      lead.full_name ? `Lead: ${lead.full_name}` : null,
      lead.phone ? `Phone: ${lead.phone}` : null,
      addrs.length > 0 ? `Stops: ${addrs.join(' | ')}` : null,
      `Status: ${t.status}`,
      `Rentals Philly`,
    ].filter(Boolean).join('\\n');
    const location = addrs[0] || '';
    return [
      'BEGIN:VEVENT',
      `UID:tour-${t.id}@rentalsphilly.vercel.app`,
      `DTSTAMP:${fmtUtc(new Date())}`,
      `DTSTART:${fmtUtc(start)}`,
      `DTEND:${fmtUtc(end)}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      location ? `LOCATION:${escapeIcs(location)}` : '',
      `STATUS:${t.status === 'completed' ? 'CONFIRMED' : 'CONFIRMED'}`,
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  }).filter(Boolean);

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rentals Philly//Tour Feed//EN',
    'X-WR-CALNAME:Rentals Philly Tours',
    'X-WR-TIMEZONE:America/New_York',
    'X-PUBLISHED-TTL:PT15M',  // calendar clients should re-fetch every 15 min
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline; filename="rentalsphilly-tours.ics"',
    },
  });
}

// POST = regenerate token. Returns the new token URL. Admin-only.
//
// Auth: a valid admin session is the primary check. As a fallback (e.g.
// for an automation calling this) we still accept the existing token in the
// body OR a fresh CRON_SECRET — so the admin UI keeps working and tooling
// stays unblocked.
export async function POST(request) {
  try {
    const db = supabaseAdmin();
    const { data: settings } = await db.from('settings').select('*').eq('id', 1).single();
    const existing = settings?.calendar_feed_token;
    const body = await request.json().catch(() => ({}));

    // First-time generation (no existing token) requires admin auth.
    // Rotation (token already exists) accepts admin auth, OR the current
    // token, OR a CRON_SECRET. Belt + suspenders.
    const adminAuth = await requireAdmin(request);
    if (!adminAuth.ok) {
      if (!existing) return adminAuth.response;
      const authHeader = request.headers.get('authorization') || '';
      const altOk = (body?.token && body.token === existing) ||
                    (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`);
      if (!altOk) return adminAuth.response;
    }

    const next = crypto.randomBytes(24).toString('hex');
    const { error } = await db.from('settings').update({ calendar_feed_token: next }).eq('id', 1);
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
    }
    const base = process.env.NEXT_PUBLIC_APP_URL ||
                 (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://rentalsphilly.vercel.app');
    return new Response(JSON.stringify({
      ok: true,
      token: next,
      url: `${base}/api/calendar/feed?token=${next}`,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 });
  }
}
