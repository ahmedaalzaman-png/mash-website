// Everything Dibsy-specific lives in this file.
// Written from Dibsy's published API shape (Mollie-style payments API).
// Verify against https://www.dibsy.dev/docs with the test key before going live:
// base URL, the amount format and where the checkout link sits in the response.

const DEFAULT_BASE = 'https://api.dibsy.one/v2';

function base(env) {
  return (env.DIBSY_API_BASE || DEFAULT_BASE).replace(/\/$/, '');
}

async function call(env, path, init = {}) {
  const res = await fetch(base(env) + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + env.DIBSY_SECRET_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { body = { raw: text }; }
  if (!res.ok) {
    const msg = (body && (body.detail || body.message || body.title)) || ('HTTP ' + res.status);
    throw new Error('Dibsy: ' + msg);
  }
  return body;
}

export async function createPayment(env, { amountQAR, description, redirectUrl, webhookUrl, metadata }) {
  const body = await call(env, '/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: { value: amountQAR.toFixed(2), currency: 'QAR' },
      description,
      redirectUrl,
      webhookUrl,
      metadata,
    }),
  });
  const checkoutUrl =
    (body._links && body._links.checkout && body._links.checkout.href) ||
    body.checkoutUrl || body.checkout_url || body.url;
  if (!body.id || !checkoutUrl) throw new Error('Dibsy: unexpected response, no payment id or checkout link');
  return { id: body.id, checkoutUrl };
}

export async function getPayment(env, id) {
  const body = await call(env, '/payments/' + encodeURIComponent(id));
  return { id: body.id, status: String(body.status || '').toLowerCase(), raw: body };
}

export function isPaid(status) {
  return ['paid', 'succeeded', 'captured', 'authorized', 'completed'].includes(status);
}

export function isFailed(status) {
  return ['failed', 'canceled', 'cancelled', 'expired', 'declined'].includes(status);
}
