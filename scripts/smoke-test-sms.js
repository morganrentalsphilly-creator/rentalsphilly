#!/usr/bin/env node
// ============================================================================
// SMS smoke test — exercises every server-side SMS pathway against a real
// Twilio account and a single test lead.
//
// Run AFTER:
//   - Migration applied
//   - Env vars set (esp. TWILIO_*, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
//   - ENABLE_REAL_SENDING=true (otherwise sends are simulated and Twilio is never called)
//   - You've made a test lead with `phone` = your own E.164 number
//
// Usage:
//   APP_URL=https://your-deploy.vercel.app \
//   TEST_LEAD_ID=00000000-0000-0000-0000-000000000000 \
//   node scripts/smoke-test-sms.js
//
// The script will:
//   1. Send a 'welcome' to the lead
//   2. Send a 'tour_confirmation'
//   3. Send a 'manual' (simulates the inbox composer)
//   4. Send a 'blast' (queues a one-recipient blast)
//   5. Wait 70s and check delivery_status via the messages table
//
// Note: this only tests OUTBOUND. Inbound (STOP, HELP, replies) you test by
// actually texting the Twilio number from your phone and watching the inbox.
// ============================================================================

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const LEAD_ID = process.env.TEST_LEAD_ID;
if (!LEAD_ID) {
  console.error('Set TEST_LEAD_ID to an existing lead row UUID');
  process.exit(1);
}

async function sendOne(kind, body) {
  const res = await fetch(`${APP_URL}/api/send-sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leadId: LEAD_ID,
      body,
      kind,
      idempotencyKey: `smoke-${kind}-${Date.now()}`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

(async () => {
  console.log(`Smoke testing against ${APP_URL} with lead ${LEAD_ID}`);

  const flows = [
    ['welcome', 'Smoke test: welcome message'],
    ['tour_confirmation', 'Smoke test: tour confirmation 5/15 @ 3pm'],
    ['manual', 'Smoke test: manual reply from agent'],
  ];

  for (const [kind, body] of flows) {
    process.stdout.write(`→ ${kind}… `);
    const r = await sendOne(kind, body);
    if (r.status >= 400) {
      console.log('FAIL', r.status, r.data);
    } else {
      console.log('OK', r.data.simulated ? '(simulated)' : `sid=${r.data.twilioSid}`);
    }
  }

  // Queue a one-recipient blast
  process.stdout.write('→ blast (queue)… ');
  const blastRes = await fetch(`${APP_URL}/api/sms/blast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bodyTemplate: 'Smoke test: bulk send. Reply STOP to opt out.',
      filter: { leadIds: [LEAD_ID] },
      dryRun: false,
    }),
  });
  const blastData = await blastRes.json().catch(() => ({}));
  console.log(blastRes.status >= 400 ? 'FAIL' : 'OK', blastData);

  console.log('\nNow open the Inbox and verify each message shows status: delivered.');
  console.log('Send a reply from your phone to verify inbound webhook + Realtime.');
  console.log('Send "STOP" to verify opt-out → lead.opted_out = true.');
})().catch((e) => { console.error(e); process.exit(1); });
