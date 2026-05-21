// GET /api/health
//
// Status check for every external integration. Used by the Settings →
// Integrations page so Morgan can see what's wired up vs. missing.
//
// Returns { supabase, twilio, resend, anthropic, sending_mode, vercel_cron }
// — each with { ok, label, detail } so the UI can render green/yellow/red.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const checks = {};

  // ---- Supabase ----
  try {
    const db = supabaseAdmin();
    const { error } = await db.from('settings').select('id').limit(1);
    if (error) throw error;
    checks.supabase = { ok: true, label: 'Connected', detail: 'Database reachable' };
  } catch (err) {
    checks.supabase = { ok: false, label: 'Failed', detail: err.message || 'Connection failed' };
  }

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
    try {
      const auth = Buffer.from(`${twSid}:${twToken}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twSid}.json`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      checks.twilio = {
        ok: true,
        label: data.status === 'active' ? 'Active' : data.status,
        detail: `Account ${data.friendly_name || twSid.slice(0, 8) + '…'} · Sender: ${twService ? `MessagingService ${twService.slice(0, 8)}…` : twNumber}`,
      };
    } catch (err) {
      checks.twilio = { ok: false, label: 'Auth failed', detail: err.message };
    }
  }

  // ---- Resend ----
  const reKey = process.env.RESEND_API_KEY;
  const reFrom = process.env.RESEND_FROM_EMAIL;
  if (!reKey) {
    checks.resend = { ok: false, label: 'Missing key', detail: 'RESEND_API_KEY not set' };
  } else if (!reFrom) {
    checks.resend = { ok: false, label: 'No FROM', detail: 'RESEND_FROM_EMAIL not set' };
  } else {
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${reKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const domains = Array.isArray(data?.data) ? data.data : [];
      const fromDomain = reFrom.split('@')[1] || '';
      const matched = domains.find((d) => (d.name || '').toLowerCase() === fromDomain.toLowerCase());
      const verified = matched?.status === 'verified';
      checks.resend = {
        ok: true,
        label: verified ? 'Verified' : matched ? `Status: ${matched.status}` : 'Unverified domain',
        detail: `From ${reFrom}${matched ? '' : ' — domain not found in Resend'}`,
      };
    } catch (err) {
      checks.resend = { ok: false, label: 'Auth failed', detail: err.message };
    }
  }

  // ---- Anthropic (AI suggested reply + tour prep) ----
  if (!process.env.ANTHROPIC_API_KEY) {
    checks.anthropic = { ok: false, label: 'Not configured', detail: 'AI features disabled — set ANTHROPIC_API_KEY to enable' };
  } else {
    checks.anthropic = { ok: true, label: 'Configured', detail: 'AI suggested replies + tour-prep enabled' };
  }

  // ---- Real-sending flag ----
  checks.sending_mode = process.env.ENABLE_REAL_SENDING === 'true'
    ? { ok: true, label: 'LIVE', detail: 'SMS & email are sending for real' }
    : { ok: false, label: 'SIMULATION', detail: 'ENABLE_REAL_SENDING is not "true" — nothing is actually being delivered' };

  // ---- Cron jobs ----
  // We don't have a way to ping Vercel's cron registry directly, but the
  // schedule lives in vercel.json. Surface that and a "last seen" hint from
  // settings if the cron updated something.
  checks.vercel_cron = { ok: true, label: 'Scheduled', detail: 'Dispatcher (every minute) + Daily summary (11 UTC) + Retention (14 UTC)' };

  return NextResponse.json(checks);
}
