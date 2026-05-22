// Server-side admin auth check for API routes.
//
// Usage from any /api/* route:
//
//   import { requireAdmin } from '@/lib/auth.server';
//   const auth = await requireAdmin(request);
//   if (!auth.ok) return auth.response;
//   // ...auth.user.email is the verified admin
//
// How it works:
//   1. Client attaches `Authorization: Bearer <supabase-access-token>` header
//      (the access token comes from the Supabase JS SDK on the client).
//   2. We verify the token against Supabase using the service-role client.
//   3. We check the verified email is in the admin allow-list (lib/auth.js).
//
// If anything fails we return a NextResponse 401/403 so the caller can just
// `return auth.response`.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isAdminEmail } from '@/lib/auth';

export async function requireAdmin(request) {
  // Extract the bearer token from Authorization header.
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    };
  }

  // Verify with Supabase. supabaseAdmin uses the service role so this call
  // resolves the token to a real user even though we're server-side.
  let user;
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'invalid_session' }, { status: 401 }),
      };
    }
    user = data.user;
  } catch (err) {
    console.error('[auth.server] token verify failed', err?.message);
    return {
      ok: false,
      response: NextResponse.json({ error: 'auth_check_failed' }, { status: 500 }),
    };
  }

  // Admin allow-list check. A valid Supabase session that isn't an admin
  // (e.g. some random user signed up via a public flow) gets bounced.
  if (!isAdminEmail(user.email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    };
  }

  return { ok: true, user };
}
