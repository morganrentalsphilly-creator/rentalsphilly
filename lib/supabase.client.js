// Browser Supabase client — uses the public anon key so it's safe to ship.
// Used for two things:
//   1. Auth (magic-link sign-in for the admin views).
//   2. Realtime subscriptions (live inbox).
//
// Reads / writes still go through /api/* routes, NOT through this client.
//
// Required env (set in .env.local AND Vercel):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY

import { createClient } from '@supabase/supabase-js';

let _client = null;

export function createBrowserSupabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    if (typeof window !== 'undefined') {
      console.warn('[supabase.client] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    return null;
  }
  _client = createClient(url, anonKey, {
    realtime: { params: { eventsPerSecond: 5 } },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,   // pick up magic-link tokens from the URL hash
      flowType: 'implicit',
    },
  });
  return _client;
}

// ---- Convenience wrappers --------------------------------------------------

export async function getSession() {
  const c = createBrowserSupabase();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data?.session || null;
}

export async function signInWithMagicLink(email) {
  const c = createBrowserSupabase();
  if (!c) return { ok: false, error: 'Supabase client not configured' };
  const redirectTo =
    (typeof window !== 'undefined' ? window.location.origin : '') + '/#admin';
  const { error } = await c.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      // We allow auto-signup so the first sign-in for the allow-listed email
      // just works. Email allow-list is enforced client-side after the session
      // is created (see ADMIN_EMAILS in lib/auth.js).
      shouldCreateUser: true,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut() {
  const c = createBrowserSupabase();
  if (!c) return;
  await c.auth.signOut();
}

export function onAuthChange(cb) {
  const c = createBrowserSupabase();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data?.subscription?.unsubscribe?.();
}
