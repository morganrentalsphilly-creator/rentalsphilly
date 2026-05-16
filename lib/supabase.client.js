// Browser Supabase client — uses the public anon key so it's safe to ship.
// Used for Realtime subscriptions (live inbox updates). Reads/writes still
// go through /api/* routes, NOT through this client.
//
// Make sure these are set in .env.local AND in Vercel project env:
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
      console.warn('[supabase.client] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — Realtime disabled');
    }
    return null;
  }
  _client = createClient(url, anonKey, {
    realtime: { params: { eventsPerSecond: 5 } },
    auth: { persistSession: false },
  });
  return _client;
}
