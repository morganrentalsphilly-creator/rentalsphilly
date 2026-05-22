// Bulk SMS endpoint.
//
// POST  /api/sms/blast            → preview (dry run) or queue a blast
//
// Request body:
//   {
//     bodyTemplate: string,        // supports {firstName}
//     filter: {                     // saved for audit + recomputed server-side
//       stages?: string[],
//       buckets?: string[],
//       includeArchived?: boolean,
//       leadIds?: string[],         // explicit list overrides filter
//     },
//     dryRun?: boolean,             // if true, just returns counts
//   }
//
// Response (dryRun):
//   { ok, totalCount, optedOutCount, sample: [{ id, full_name, phone }] }
//
// Response (queued):
//   { ok, blastId, totalCount, queuedCount, optedOutCount }

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth.server';

async function resolveAudience(db, filter) {
  const leadIds = filter?.leadIds;
  if (Array.isArray(leadIds) && leadIds.length > 0) {
    const { data, error } = await db
      .from('leads')
      .select('id, full_name, phone, opted_out, stage, bucket')
      .in('id', leadIds);
    if (error) throw error;
    return data || [];
  }

  let q = db.from('leads').select('id, full_name, phone, opted_out, stage, bucket');
  if (filter?.stages?.length) q = q.in('stage', filter.stages);
  if (filter?.buckets?.length) q = q.in('bucket', filter.buckets);
  if (!filter?.includeArchived) q = q.not('stage', 'in', '(archived,leased,lost)');
  q = q.not('phone', 'is', null);
  const { data, error } = await q.limit(1000);
  if (error) throw error;
  return data || [];
}

export async function POST(request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const { bodyTemplate, filter, dryRun } = await request.json();
    if (!bodyTemplate || typeof bodyTemplate !== 'string') {
      return NextResponse.json({ error: 'bodyTemplate is required' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const audience = await resolveAudience(db, filter || {});
    const optedOut = audience.filter((l) => l.opted_out);
    const sendable = audience.filter((l) => !l.opted_out && l.phone);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        totalCount: audience.length,
        optedOutCount: optedOut.length,
        sendableCount: sendable.length,
        sample: sendable.slice(0, 10).map((l) => ({
          id: l.id, full_name: l.full_name, phone: l.phone,
        })),
      });
    }

    // 1. Create the blast row.
    const { data: blast, error: blastErr } = await db
      .from('sms_blasts')
      .insert({
        body_template: bodyTemplate,
        audience_filter: filter || {},
        total_count: sendable.length,
        opted_out_count: optedOut.length,
        status: 'queued',
      })
      .select()
      .single();
    if (blastErr || !blast) {
      console.error('[blast] failed to create blast', blastErr);
      return NextResponse.json({ error: blastErr?.message || 'create_failed' }, { status: 500 });
    }

    // 2. Insert pending recipients.
    if (sendable.length > 0) {
      const rows = sendable.map((l) => ({
        blast_id: blast.id,
        lead_id: l.id,
        status: 'pending',
      }));
      const { error: rcptErr } = await db.from('sms_blast_recipients').insert(rows);
      if (rcptErr) {
        console.error('[blast] failed to insert recipients', rcptErr);
        return NextResponse.json({ error: rcptErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      blastId: blast.id,
      totalCount: audience.length,
      queuedCount: sendable.length,
      optedOutCount: optedOut.length,
    });
  } catch (err) {
    console.error('[api/sms/blast]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// List blasts for the admin UI.
export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const db = supabaseAdmin();
    const { data, error } = await db
      .from('sms_blasts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ ok: true, blasts: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
