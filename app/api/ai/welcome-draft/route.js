// ============================================================================
// DEPRECATED — POST /api/ai/welcome-draft
//
// This route used to draft personalized welcome SMS/email per lead but was
// folded into /api/intake/welcome (server-side, atomic with the welcome send)
// in the 4-bucket workflow refactor. The old version also referenced credit
// directly in the AI prompt — incompatible with the "never mention credit
// in customer-facing copy" product policy.
//
// Returning 410 Gone so a stale client (or a probe) gets a clear signal
// instead of accidentally hitting an out-of-date prompt that could ship
// credit language to a real lead.
// ============================================================================

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'gone',
      message: 'This endpoint was folded into /api/intake/welcome. The welcome draft now runs server-side as part of the welcome send.',
    },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'gone', message: 'See POST /api/intake/welcome.' },
    { status: 410 },
  );
}
