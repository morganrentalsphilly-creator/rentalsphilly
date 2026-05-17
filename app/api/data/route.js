import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/data?resource=leads  → load everything (or a filtered slice)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const resource = searchParams.get('resource');

  try {
    const db = supabaseAdmin();

    if (resource === 'all') {
      // Load everything needed to hydrate the app
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
export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;
    const db = supabaseAdmin();

    switch (action) {
      case 'create_lead': {
        const { lead } = body;
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
        const { data, error } = await db.from('settings').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', 1).select().single();
        if (error) throw error;
        return NextResponse.json({ settings: data });
      }
      case 'upload_application': {
        const { leadId, filename, base64 } = body;
        const db = supabaseAdmin();
        // Strip the data URL prefix if present
        const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
        const buffer = Buffer.from(cleanBase64, 'base64');
        const path = `${leadId}/${Date.now()}_${filename}`;
        const { error } = await db.storage.from('applications').upload(path, buffer, {
          contentType: 'application/pdf',
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