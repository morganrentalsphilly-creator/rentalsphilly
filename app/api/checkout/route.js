// Creates a Stripe Checkout Session for a funnel product and redirects.
// Public endpoint (the buyer isn't logged in). Price IDs are pinned to
// products that already exist in the Stripe account.

import { NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe.server';

const PRICES = {
  application_kit: 'price_1TgZGk3yTn6y2v95wg7oMWBG',   // $9
  approval_package: 'price_1TgZGk3yTn6y2v95W9Lni3ER',  // $39
  voucher_guide: 'price_1TgZGl3yTn6y2v95QKDs01mK',     // $10
  get_approved_kit: 'price_1TgZGm3yTn6y2v95cGzy4Vby',  // $79
};

export async function POST(request) {
  try {
    const form = await request.formData();
    const leadId = String(form.get('lead') || '');
    const band = String(form.get('band') || '');
    const product = String(form.get('product') || 'approval_package');
    const price = PRICES[product];
    if (!price) return NextResponse.json({ error: 'Unknown product' }, { status: 400 });

    const origin = new URL(request.url).origin;
    const session = await createCheckoutSession({
      price,
      leadId,
      product,
      successUrl: `${origin}/download?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/get-approved?lead=${encodeURIComponent(leadId)}&band=${encodeURIComponent(band)}`,
    });

    return NextResponse.redirect(session.url, 303);
  } catch (e) {
    console.error('[checkout] failed', e?.message);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
