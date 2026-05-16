// Thin HTTP wrapper around lib/sms.server.js. The wrapper is where the actual
// business logic lives — see that file for opt-out / idempotency / kill-switch
// behavior. This route is called from the client (via lib/messaging.js).
//
// Request body:
//   {
//     leadId:           uuid, required
//     body:             string, required
//     kind:             string, required (e.g. 'manual', 'tour_confirmation')
//     to?:              string, optional override
//     idempotencyKey?:  string, optional
//     automated?:       boolean, optional
//   }
//
// Backwards-compatible: if `leadId` is missing but legacy { to, body } is
// supplied, we 400 with a clear message so we can find every old caller.

import { NextResponse } from 'next/server';
import { sendSms } from '@/lib/sms.server';

export async function POST(request) {
  try {
    const payload = await request.json();
    const { leadId, body, kind, to, idempotencyKey, automated } = payload || {};

    if (!leadId) {
      // Legacy callers were `{ to, body }`. Make the migration loud.
      return NextResponse.json(
        {
          error:
            'Missing leadId. /api/send-sms now requires { leadId, body, kind }. ' +
            'See lib/sms.server.js for the contract.',
        },
        { status: 400 }
      );
    }
    if (!body || !kind) {
      return NextResponse.json(
        { error: 'Missing body or kind' },
        { status: 400 }
      );
    }

    const result = await sendSms({
      leadId, body, kind, to, idempotencyKey, automated,
    });

    if (!result.ok) {
      const status =
        result.error === 'opted_out' ? 409 :
        result.error === 'lead_not_found' ? 404 :
        result.error === 'invalid_phone' ? 422 :
        500;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/send-sms]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
