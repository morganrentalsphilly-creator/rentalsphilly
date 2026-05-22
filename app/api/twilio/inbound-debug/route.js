// Admin-only diagnostic for the inbound SMS flow.
//
// GET /api/twilio/inbound-debug?from=2154041234
//   → returns JSON showing exactly what the real webhook would do for an
//     inbound from that number, WITHOUT actually inserting any messages or
//     creating stub leads. Lets Morgan verify the lead-match logic end-to-end
//     in production without firing real SMS.
//
// Auth: requires admin session (same as the rest of /api/data writes).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { toE164 } from '@/lib/sms.server';
import { requireAdmin } from '@/lib/auth.server';

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const rawFrom = searchParams.get('from') || '';
  const from = toE164(rawFrom) || rawFrom;
  if (!from) {
    return NextResponse.json({ error: 'missing_from', hint: 'Pass ?from=2154041234' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const digits = from.replace(/^\+1/, '');
  const last10 = digits.slice(-10);
  const e164 = last10.length === 10 ? `+1${last10}` : null;
  const pretty = last10.length === 10
    ? `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`
    : null;

  const attempts = [];
  const candidates = [from, e164, last10, pretty].filter(Boolean);

  // Step 1: try each exact candidate in order.
  for (const candidate of candidates) {
    const { data, error } = await db
      .from('leads')
      .select('id, full_name, phone, opted_out, created_at')
      .eq('phone', candidate)
      .order('created_at', { ascending: false })
      .limit(1);
    attempts.push({
      step: 'exact_eq',
      candidate,
      matched: !!(data && data[0]),
      error: error?.message || null,
      lead: data?.[0] ? { id: data[0].id, name: data[0].full_name, phone: data[0].phone } : null,
    });
    if (data && data[0]) {
      return NextResponse.json({
        ok: true,
        from,
        last10,
        matched: true,
        matchedAt: 'exact_eq',
        lead: { id: data[0].id, name: data[0].full_name, phone: data[0].phone },
        attempts,
      });
    }
  }

  // Step 2: LIKE digit-suffix fallback.
  if (last10.length === 10) {
    const likePattern = '%' + last10.split('').join('%') + '%';
    const { data, error } = await db
      .from('leads')
      .select('id, full_name, phone, opted_out, created_at')
      .like('phone', likePattern)
      .order('created_at', { ascending: false })
      .limit(1);
    attempts.push({
      step: 'like_digit_suffix',
      candidate: likePattern,
      matched: !!(data && data[0]),
      error: error?.message || null,
      lead: data?.[0] ? { id: data[0].id, name: data[0].full_name, phone: data[0].phone } : null,
    });
    if (data && data[0]) {
      return NextResponse.json({
        ok: true,
        from,
        last10,
        matched: true,
        matchedAt: 'like_digit_suffix',
        lead: { id: data[0].id, name: data[0].full_name, phone: data[0].phone },
        attempts,
      });
    }
  }

  // No match — show what the webhook would do.
  return NextResponse.json({
    ok: true,
    from,
    last10,
    matched: false,
    attempts,
    nextAction: 'Real webhook would auto-create a stub lead and attach the message to it.',
    hint: last10.length === 10
      ? 'No lead in your DB has these 10 digits anywhere in their phone field. Check the lead\'s phone is stored correctly.'
      : 'The "from" number didn\'t parse to 10 digits. Pass a US 10-digit or +1XXXXXXXXXX number.',
  });
}
