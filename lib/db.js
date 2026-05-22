// Client-side helpers that call /api/data.
// Your React components use these instead of window.storage.
//
// Calls go through authedFetch which auto-attaches the Supabase session token
// AND auto-signs-out on 401 so a stale session bounces cleanly back to login.

import { authedFetch } from '@/lib/api';

async function api(method, body) {
    const opts = { method };
    if (body) opts.body = JSON.stringify(body);
    const url = method === 'GET' ? `/api/data?resource=all` : '/api/data';
    const res = await authedFetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API error');
    return data;
  }

  export async function loadAll() {
    return api('GET');
  }

  // Public-flow data only (landing, intake, listings, booking). Skips all the
  // heavy CRM tables. Use this on first paint; call loadAll() only when the
  // user actually enters admin. No auth header — endpoint is intentionally
  // unauthenticated.
  export async function loadPublic() {
    const res = await fetch('/api/data?resource=public');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API error');
    return data;
  }
  
  export async function createLead(lead) {
    const { lead: created } = await api('POST', { action: 'create_lead', lead });
    return created;
  }
  
  export async function updateLead(id, updates) {
    const { lead } = await api('POST', { action: 'update_lead', id, updates });
    return lead;
  }
  
  export async function deleteAllLeads() {
    return api('POST', { action: 'delete_all_leads' });
  }

  // Hard-delete a single lead + all child rows (messages, activities, tasks,
  // tours, submissions). Cannot be undone — caller is responsible for the UX
  // confirmation step.
  export async function deleteLead(id) {
    return api('POST', { action: 'delete_lead', id });
  }
  
  export async function insertMessage(message) {
    const { message: created } = await api('POST', { action: 'insert_message', message });
    return created;
  }
  
  export async function insertActivity(activity) {
    const { activity: created } = await api('POST', { action: 'insert_activity', activity });
    return created;
  }
  
  export async function insertTour(tour) {
    const { tour: created } = await api('POST', { action: 'insert_tour', tour });
    return created;
  }
  
  export async function updateTour(id, updates) {
    const { tour } = await api('POST', { action: 'update_tour', id, updates });
    return tour;
  }
  
  export async function upsertSlot(slot) {
    const { slot: upserted } = await api('POST', { action: 'upsert_slot', slot });
    return upserted;
  }
  
  export async function deleteSlot(id) {
    return api('POST', { action: 'delete_slot', id });
  }
  
  export async function insertWaitlist(entry) {
    const { entry: created } = await api('POST', { action: 'insert_waitlist', entry });
    return created;
  }
  
  export async function insertTask(task) {
    const { task: created } = await api('POST', { action: 'insert_task', task });
    return created;
  }
  
  export async function updateTask(id, updates) {
    const { task } = await api('POST', { action: 'update_task', id, updates });
    return task;
  }
  
  export async function insertSubmission(submission) {
    const { submission: created } = await api('POST', { action: 'insert_submission', submission });
    return created;
  }
  
  export async function updateSubmission(id, updates) {
    const { submission } = await api('POST', { action: 'update_submission', id, updates });
    return submission;
  }
  
  export async function updateSettings(updates) {
    const { settings } = await api('POST', { action: 'update_settings', updates });
    return settings;
  }
  
  export async function uploadApplication({ leadId, filename, base64 }) {
    const { path, url } = await api('POST', { action: 'upload_application', leadId, filename, base64 });
    return { path, url };
  }
  
  export async function deleteApplication(path) {
    return api('POST', { action: 'delete_application', path });
  }

  // Upload an arbitrary lead document (app PDF, ID scan, pay stub, etc).
  // contentType is inferred from the filename extension on the server if omitted.
  export async function uploadDocument({ leadId, filename, base64, contentType }) {
    return api('POST', { action: 'upload_document', leadId, filename, base64, contentType });
  }

  export async function deleteDocument(path) {
    return api('POST', { action: 'delete_document', path });
  }

  export async function upsertProperty(property) {
    const { property: upserted } = await api('POST', { action: 'upsert_property', property });
    return upserted;
  }

  export async function deleteProperty(id) {
    return api('POST', { action: 'delete_property', id });
  }