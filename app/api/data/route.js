import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth.server';

// GET /api/data?resource=leads  → load everything (or a filtered slice)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const resource = searchParams.get('resource');

  try {
    const db = supabaseAdmin();

    if (resource === 'public') {
      // Lightweight load for landing / intake / listings flow. Skips all the
      // heavy CRM tables (leads, messages, activities, tasks, etc).
      // INTENTIONALLY unauthenticated — used by the public landing page.
      const [properties, settingsRow] = await Promise.all([
        db.from('properties').select('*').eq('status', 'active').order('created_at', { ascending: false }),
        db.from('settings').select('*').eq('id', 1).single(),
      ]);
      // Cache at the Vercel edge for 60s; subsequent visitors within that
      // window get an instant edge response instead of a fresh DB roundtrip.
      // stale-while-revalidate lets us serve stale data for up to 10 min while
      // the next refresh runs in the background.
      return NextResponse.json(
        {
          properties: properties.data || [],
          settings: settingsRow.data || null,
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600',
          },
        }
      );
    }

    if (resource === 'all') {
      // Every CRM-level table — STRICTLY admin only. Without this gate, anyone
      // hitting /api/data?resource=all would dump the whole database.
      const auth = await requireAdmin(request);
      if (!auth.ok) return auth.response;
      // Load everything needed to hydrate the admin CRM.
      const [leads, tours, slots, waitlist, messages, activities, tasks, submissions, nudges, properties, settingsRow] =
        await Promise.all([
          db.from('leads').select('*').order('created_at', { ascending: false }),
          db.from('tours').select('*'),
          db.from('slots').select('*'),
          db.from('waitlist').select('*'),
          db.from('messages').select('*').order('created_at', { ascending: true }),
          db.from('activities').select('*').order('created_at', { ascending: true }),
          db.from('tasks').select('*'),
          db.from('submissions').select('*'),
          db.from('scheduled_nudges').select('*'),
          db.from('properties').select('*').order('created_at', { ascending: false }),
          db.from('settings').select('*').eq('id', 1).single(),
        ]);

      return NextResponse.json({
        leads: leads.data || [],
        tours: tours.data || [],
        slots: slots.data || [],
        waitlist: waitlist.data || [],
        messages: messages.data || [],
        activities: activities.data || [],
        tasks: tasks.data || [],
        submissions: submissions.data || [],
        scheduledNudges: nudges.data || [],
        properties: properties.data || [],
        settings: settingsRow.data || null,
      });
    }

    return NextResponse.json({ error: 'Unknown resource' }, { status: 400 });
  } catch (err) {
    console.error('[api/data GET]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/data  body: { action, ...payload }
// Central write endpoint. Routes to the right handler based on `action`.
//
// Auth model:
//   - `create_lead` is INTENTIONALLY public — the intake form has to be able
//     to hit it without a login. We rely on the anti-spam guards in the form
//     (honeypot + min-time) to keep junk out.
//   - Every other action requires a valid admin session via requireAdmin().
export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;
    const db = supabaseAdmin();

    // Gate non-public actions behind the admin auth check. Doing this up front
    // means a single check covers every write besides intake-form lead creation.
    if (action !== 'create_lead') {
      const auth = await requireAdmin(request);
      if (!auth.ok) return auth.response;
    }

    switch (action) {
      case 'create_lead': {
        const { lead } = body;
        // Server-side dedup. The intake form already has a client-side
        // sync-ref lock + 3-second honeypot timer, but a network retry,
        // refresh-and-resubmit, or accidental form re-render could still
        // POST twice. If a lead with the same phone (last 10 digits, which
        // is how we normalize) was created in the last 60 seconds, return
        // the existing row instead of inserting a duplicate. The 60-second
        // window is short enough that a genuine "different person, same
        // number" (rare — usually only when a couple shares a phone)
        // still goes through after a brief wait, and tight enough to
        // catch retry storms.
        const rawPhone = (lead?.phone || '').replace(/\D/g, '');
        const last10 = rawPhone.slice(-10);
        if (last10.length === 10) {
          const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
          const { data: recent } = await db
            .from('leads')
            .select('*')
            .gte('created_at', sixtySecondsAgo)
            .order('created_at', { ascending: false })
            .limit(20);
          const dup = (recent || []).find((r) => {
            const rPhone = (r.phone || '').replace(/\D/g, '').slice(-10);
            return rPhone === last10;
          });
          if (dup) {
            console.warn('[create_lead] dedup hit — returning existing lead', { phone: last10, dupId: dup.id });
            return NextResponse.json({ lead: dup, deduped: true });
          }
        }
        const { data, error } = await db.from('leads').insert(lead).select().single();
        if (error) throw error;
        return NextResponse.json({ lead: data });
      }

      case 'update_lead': {
        const { id, updates } = body;
        const { data, error } = await db.from('leads').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return NextResponse.json({ lead: data });
      }

      case 'delete_all_leads': {
        const { error } = await db.from('leads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case 'delete_lead': {
        // Hard-delete a single lead and every child row that references it.
        // We delete child tables explicitly so this works even on schemas
        // without ON DELETE CASCADE configured. Order: child rows first, then
        // the lead. Each step is best-effort — log on error but keep going so
        // a missing child table doesn't block the lead delete.
        const { id } = body;
        if (!id) return NextResponse.json({ error: 'missing_lead_id' }, { status: 400 });
        const childTables = [
          'messages',
          'activities',
          'tasks',
          'tours',
          'submissions',
          'scheduled_nudges',
          'sms_blast_recipients',
        ];
        const childErrors = [];
        for (const t of childTables) {
          const { error } = await db.from(t).delete().eq('lead_id', id);
          if (error) {
            console.warn(`[delete_lead] child '${t}' delete error`, error.message);
            childErrors.push({ table: t, error: error.message });
          }
        }
        // Also clean any uploaded application/document blobs from storage. We
        // discover paths by scanning the storage bucket for the lead's folder.
        try {
          const { data: storageList } = await db.storage.from('applications').list(id, { limit: 100 });
          if (storageList?.length) {
            const paths = storageList.map((f) => `${id}/${f.name}`);
            await db.storage.from('applications').remove(paths);
          }
        } catch (storageErr) {
          console.warn('[delete_lead] storage cleanup failed', storageErr?.message);
        }
        const { error } = await db.from('leads').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ ok: true, childErrors });
      }

      case 'insert_message': {
        const { message } = body;
        const { data, error } = await db.from('messages').insert(message).select().single();
        if (error) throw error;
        return NextResponse.json({ message: data });
      }

      case 'insert_activity': {
        const { activity } = body;
        const { data, error } = await db.from('activities').insert(activity).select().single();
        if (error) throw error;
        return NextResponse.json({ activity: data });
      }

      case 'insert_tour': {
        const { tour } = body;
        const { data, error } = await db.from('tours').insert(tour).select().single();
        if (error) throw error;
        return NextResponse.json({ tour: data });
      }

      case 'update_tour': {
        const { id, updates } = body;
        const { data, error } = await db.from('tours').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return NextResponse.json({ tour: data });
      }

      case 'upsert_slot': {
        const { slot } = body;
        const { data, error } = await db.from('slots').upsert(slot).select().single();
        if (error) throw error;
        return NextResponse.json({ slot: data });
      }

      case 'delete_slot': {
        const { id } = body;
        const { error } = await db.from('slots').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case 'insert_waitlist': {
        const { entry } = body;
        const { data, error } = await db.from('waitlist').insert(entry).select().single();
        if (error) throw error;
        return NextResponse.json({ entry: data });
      }

      case 'insert_task': {
        const { task } = body;
        const { data, error } = await db.from('tasks').insert(task).select().single();
        if (error) throw error;
        return NextResponse.json({ task: data });
      }

      case 'update_task': {
        const { id, updates } = body;
        const { data, error } = await db.from('tasks').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return NextResponse.json({ task: data });
      }

      case 'insert_submission': {
        const { submission } = body;
        const { data, error } = await db.from('submissions').insert(submission).select().single();
        if (error) throw error;
        return NextResponse.json({ submission: data });
      }

      case 'update_submission': {
        const { id, updates } = body;
        const { data, error } = await db.from('submissions').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return NextResponse.json({ submission: data });
      }

      case 'update_settings': {
        const { updates } = body;
        // Resilient update: if Postgres rejects an unknown column (because a
        // migration hasn't been applied yet — e.g. 0004 added agent_availability,
        // 0005 added raw, or a future column hasn't been migrated), parse the
        // missing column name out of the error and retry without it. We log a
        // warning so the missing migration is visible in server logs without
        // breaking the user's save. Capped at a handful of retries.
        //
        // Postgres / PostgREST emit one of these phrasings when a column is
        // missing, so the regex covers both:
        //   "Could not find the 'foo' column of 'settings' in the schema cache"
        //   "column \"foo\" of relation \"settings\" does not exist"
        const extractMissingColumn = (err) => {
          const msg = String(err?.message || err || '');
          const m = msg.match(/['"]([\w-]+)['"]\s+(?:column|of)/i)
                 || msg.match(/column\s+['"]?([\w-]+)['"]?\s+(?:of|does not exist)/i);
          return m && m[1] ? m[1] : null;
        };
        let payload = { ...updates, updated_at: new Date().toISOString() };
        let lastErr = null;
        for (let i = 0; i < 8; i++) {
          const { data, error } = await db.from('settings').update(payload).eq('id', 1).select().single();
          if (!error) {
            return NextResponse.json({ settings: data });
          }
          lastErr = error;
          const missing = extractMissingColumn(error);
          if (!missing || !(missing in payload)) break;
          console.warn(`[/api/data update_settings] dropped unknown column "${missing}" — apply latest supabase migration to persist it.`);
          delete payload[missing];
        }
        throw lastErr;
      }
      case 'upload_application':
      case 'upload_document': {
        const { leadId, filename, base64, contentType } = body;
        const db = supabaseAdmin();
        // Strip the data URL prefix if present
        const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
        const buffer = Buffer.from(cleanBase64, 'base64');
        // Infer content type from extension if not provided. Reasonable
        // defaults for what tenants typically send.
        const ext = (filename || '').toLowerCase().split('.').pop();
        const inferred = {
          pdf: 'application/pdf',
          png: 'image/png',
          jpg: 'image/jpeg', jpeg: 'image/jpeg',
          heic: 'image/heic',
          webp: 'image/webp',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          doc: 'application/msword',
          xls: 'application/vnd.ms-excel',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          txt: 'text/plain',
        }[ext] || 'application/octet-stream';
        const path = `${leadId}/${Date.now()}_${filename}`;
        const { error } = await db.storage.from('applications').upload(path, buffer, {
          contentType: contentType || inferred,
          upsert: false,
        });
        if (error) throw error;
        // Generate a signed URL good for 1 year
        const { data: signed, error: urlError } = await db.storage
          .from('applications')
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (urlError) throw urlError;
        return NextResponse.json({ path, url: signed.signedUrl });
      }
      case 'delete_document': {
        const { path } = body;
        const db = supabaseAdmin();
        const { error } = await db.storage.from('applications').remove([path]);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case 'delete_application': {
        const { path } = body;
        const db = supabaseAdmin();
        const { error } = await db.storage.from('applications').remove([path]);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case 'upsert_property': {
        const { property } = body;
        const { data, error } = await db.from('properties').upsert(property).select().single();
        if (error) throw error;
        return NextResponse.json({ property: data });
      }

      case 'delete_property': {
        const { id } = body;
        const { error } = await db.from('properties').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[api/data POST]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}