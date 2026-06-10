// Minimal server-side Stripe helpers using the REST API directly.
// Deliberately avoids the `stripe` npm package so the funnel adds zero
// dependencies. Secret key comes from STRIPE_SECRET_KEY (Vercel env).

import crypto from 'crypto';

const STRIPE_API = 'https://api.stripe.com/v1';

function authHeaders() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

/** Create a Checkout Session. Returns the session object (incl. .url). */
export async function createCheckoutSession({ price, leadId, product, successUrl, cancelUrl }) {
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('line_items[0][price]', price);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  if (leadId) params.set('client_reference_id', leadId);
  params.set('metadata[leadId]', leadId || '');
  params.set('metadata[product]', product);

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: authHeaders(),
    body: params.toString(),
  });
  const session = await res.json();
  if (!res.ok) throw new Error(session?.error?.message || 'Stripe session create failed');
  return session;
}

/** Retrieve a Checkout Session by id. Returns null on any failure. */
export async function retrieveCheckoutSession(sessionId) {
  if (!sessionId) return null;
  try {
    const res = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Verify a Stripe webhook signature (Stripe-Signature header).
 * Implements Stripe's documented scheme: HMAC-SHA256 over `${t}.${payload}`
 * with the endpoint signing secret; compares against all v1 signatures;
 * rejects events older than `toleranceSec`.
 */
export function verifyStripeSignature(payload, sigHeader, secret, toleranceSec = 300) {
  if (!payload || !sigHeader || !secret) return false;
  const parts = sigHeader.split(',').map((p) => p.split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const v1s = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || v1s.length === 0) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > toleranceSec) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest('hex');
  return v1s.some((v1) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
    } catch {
      return false;
    }
  });
}
