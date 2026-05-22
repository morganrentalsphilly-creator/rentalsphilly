// Shared client-side helper for hitting authenticated API routes.
//
// All admin-facing endpoints (CRM CRUD, send-sms / send-email, AI endpoints)
// require an Authorization: Bearer <supabase-access-token> header. This module
// pulls the current session token and attaches it automatically so individual
// call sites don't have to think about auth.
//
// Usage:
//   import { authedFetch } from '@/lib/api';
//   const res = await authedFetch('/api/ai/lead-summary', {
//     method: 'POST',
//     body: JSON.stringify({ leadId }),
//   });

import { createBrowserSupabase } from '@/lib/supabase.client';

export async function authHeader() {
  try {
    const c = createBrowserSupabase();
    if (!c) return null;
    const { data } = await c.auth.getSession();
    const token = data?.session?.access_token;
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

// Thin fetch wrapper that auto-attaches Authorization + Content-Type. Returns
// the raw Response so callers can decide how to handle it. Use this for all
// admin-only endpoints; for public ones (intake, /api/curated/[token]) just
// use fetch() directly.
//
// If the server returns 401 (no/expired session), we proactively sign the
// user out. The onAuthChange listener at the App level then routes them back
// to the login screen, so the next page they see is sign-in instead of a wall
// of cryptic "unauthenticated" errors.
let _signingOut = false;
export async function authedFetch(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const auth = await authHeader();
  if (auth) headers.Authorization = auth;
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401 && !_signingOut) {
    _signingOut = true;
    try {
      const c = createBrowserSupabase();
      await c?.auth.signOut();
    } catch {
      // best-effort; the response is still returned to the caller below
    } finally {
      // Brief debounce so a burst of 401s doesn't churn sign-outs.
      setTimeout(() => { _signingOut = false; }, 2000);
    }
  }
  return res;
}
