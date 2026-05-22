// GET /api/health
//
// Status check for every external integration. Used by the Settings →
// Integrations page so Morgan can see what's wired up vs. missing.
//
// Returns { supabase, twilio, resend, anthropic, sending_mode, vercel_cron }
// — each with { ok, label, detail, latency_ms? } so the UI can render
// green/yellow/red and surface slow integrations.
//
// Cached briefly at the edge — health checks shouldn't hammer external APIs
// when the page polls. 30s stale-while-revalidate.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Helper: time an async check, attach latency_ms to its result.
async function timed(fn) {
  const start = Date.now();
  try {
    const result = await fn();
    return { ...result, latency_ms: Date.now() - start };
  } catch (err) {
    return { ok: false, label: 'Failed', detail: err.message || String(err), latency_ms: Date.now() - start };
  }
}

// Format "X seconds/minutes/hours ago" for the cron heartbeat freshness label.
function timeSince(iso) {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'in the future?';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export async function GET() {
  const checks = {};

  // ---- Supabase ----
  checks.supabase = await timed(async () => {
    const db = supabaseAdmin();
    const { error } = await db.from('settings').select('id').limit(1);
    if (error) throw error;
    return { ok: true, label: 'Connected', detail: 'Database reachable' };
  });

  // ---- Twilio ----
  const twSid = process.env.TWILIO_ACCOUNT_SID;
  const twToken = process.env.TWILIO_AUTH_TOKEN;
  const twService = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const twNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!twSid || !twToken) {
    checks.twilio = { ok: false, label: 'Missing keys', detail: 'TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN not set' };
  } else if (!twService && !twNumber) {
    checks.twilio = { ok: false, label: 'No sender', detail: 'Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER' };
  } else {
    // Hit Twilio to confirm credentials work. Cheap call — fetches account info.
    checks.twilio = await timed(async () => {
      const auth = Buffer.from(`${twSid}:${twToken}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twSid}.json`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        ok: true,
        label: data.status === 'active' ? 'Active' : data.status,
        detail: `Account ${data.friendly_name || twSid.slice(0, 8) + '…'} · Sender: ${twService ? `MessagingService ${twService.slice(0, 8)}…` : twNumber}`,
      };
    });
  }

  // ---- Resend ----
  const reKey = process.env.RESEND_API_KEY;
  const reFrom = process.env.RESEND_FROM_EMAIL;
  if (!reKey) {
    checks.resend = { ok: false, label: 'Missing key', detail: 'RESEND_API_KEY not set' };
  } else if (!reFrom) {
    checks.resend = { ok: false, label: 'No FROM', detail: 'RESEND_FROM_EMAIL not set' };
  } else {
    checks.resend = await timed(async () => {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${reKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const domains = Array.isArray(data?.data) ? data.data : [];
      const fromDomain = reFrom.split('@')[1] || '';
      const matched = domains.find((d) => (d.name || '').toLowerCase() === fromDomain.toLowerCase());
      const verified = matched?.status === 'verified';
      return {
        ok: true,
        label: verified ? 'Verified' : matched ? `Status: ${matched.status}` : 'Unverified domain',
        detail: `From ${reFrom}${matched ? '' : ' — domain not found in Resend'}`,
      };
    });
  }

  // ---- Anthropic — actually ping the API to verify the key works. Cheapest
  // valid call: minimal Haiku request with max_tokens=1. Costs ~$0.000004.
  if (!process.env.ANTHROPIC_API_KEY) {
    checks.anthropic = { ok: false, label: 'Not configured', detail: 'AI features disabled — set ANTHROPIC_API_KEY to enable' };
  } else {
    checks.anthropic = await timed(async () => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      if (res.status === 401) throw new Error('Invalid API key');
      if (res.status === 429) {
        return { ok: true, label: 'Rate limited', detail: 'Key valid but currently rate-limited' };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { ok: true, label: 'Active', detail: 'Claude Haiku 4.5 reachable' };
    });
  }

  // ---- Real-sending flag ----
  checks.sending_mode = process.env.ENABLE_REAL_SENDING === 'true'
    ? { ok: true, label: 'LIVE', detail: 'SMS & email are sending for real' }
    : { ok: false, label: 'SIMULATION', detail: 'ENABLE_REAL_SENDING is not "true" — nothing is actually being delivered' };

  // ---- Cron heartbeat ----
  // The dispatcher writes settings.raw.last_cron_tick on every run. If we
  // don't see a tick in the last 3 minutes, something's wrong with the cron.
  // Threshold of 3 min gives 2 missed ticks of grace before alerting.
  try {
    const db = supabaseAdmin();
    // SELECT * (not 'raw') so this query doesn't fail entirely if the `raw`
    // column hasn't been added yet (migration 0005). When the column is
    // missing we surface a clear "apply this migration" message rather than
    // a generic "Heartbeat read failed".
    const { data: settingsRow, error: settingsErr } = await db.from('settings').select('*').eq('id', 1).single();
    if (settingsErr) throw settingsErr;
    if (!settingsRow || !('raw' in settingsRow)) {
      checks.vercel_cron = {
        ok: false,
        label: 'Missing `raw` column',
        detail: 'Apply supabase/migrations/0005_settings_raw_column.sql — the cron heartbeat + Settings → Save both rely on it.',
      };
    } else {
      const lastTick = settingsRow?.raw?.last_cron_tick;
      const lastSummary = settingsRow?.raw?.last_cron_summary || {};
      if (!lastTick) {
        checks.vercel_cron = { ok: false, label: 'No heartbeat', detail: 'Dispatcher has never run — check vercel.json + CRON_SECRET' };
      } else {
        const ageMs = Date.now() - new Date(lastTick).getTime();
        const stale = ageMs > 3 * 60 * 1000;
        checks.vercel_cron = stale
          ? { ok: false, label: `Stale (${timeSince(lastTick)})`, detail: 'Dispatcher hasn\'t ticked in 3+ min. Check Vercel cron logs.' }
          : { ok: true, label: `Last tick ${timeSince(lastTick)}`, detail: `Reminders: ${lastSummary.reminders ?? '—'} · Nudges: ${lastSummary.nudges ?? '—'} · Tour outcomes: ${lastSummary.tour_outcomes ?? '—'} · Blast: ${lastSummary.blast ?? 0}` };
      }
    }
  } catch (err) {
    checks.vercel_cron = { ok: false, label: 'Heartbeat read failed', detail: err.message };
  }

  return NextResponse.json(checks, {
    headers: {
      // Cache at the edge for 30s so the Integrations page doesn't burn external
      // API quota when polled. SWR keeps the response fresh in the background.
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    },
  });
}
