// Stripe webhook: on checkout.session.completed, tag the lead as a package
// buyer in the CRM (raw.tags + raw.package_purchase) so it shows in the
// lead's record. Configure in Stripe Dashboard:
//   endpoint: https://rentalsphilly.com/api/stripe-webhook
//   event:    checkout.session.completed
// and set STRIPE_WEBHOOK_SECRET to the endpoint's signing secret.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyStripeSignature } from '@/lib/stripe.server';

export async function POST(request) {
  const payload = await request.text();
  const sig = request.headers.get('stripe-signature') || '';

  if (!verifyStripeSignature(payload, sig, process.env.STRIPE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object || {};
    const leadId = session.metadata?.leadId || session.client_reference_id;
    const product = session.metadata?.product || 'unknown';

    if (leadId) {
      try {
        const db = supabaseAdmin();
        const { data: lead } = await db.from('leads').select('id, raw').eq('id', leadId).single();
        if (lead) {
          const raw = lead.raw || {};
          const tags = Array.isArray(raw.tags) ? raw.tags : [];
          if (!tags.includes('Package buyer')) tags.push('Package buyer');
          raw.tags = tags;
          raw.package_purchase = {
            product,
            stripe_session: session.id,
            amount_total: session.amount_total,
            purchased_at: new Date().toISOString(),
          };
          await db.from('leads').update({ raw }).eq('id', leadId);
          console.log('[stripe-webhook] lead tagged as buyer', { leadId, product });
        }
      } catch (e) {
        // Never fail the webhook over a CRM write — Stripe would retry and
        // the buyer already has their files via /download.
        console.error('[stripe-webhook] CRM update failed', e?.message);
      }
    }
  }

  return NextResponse.json({ received: true });
}
