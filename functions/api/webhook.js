import { readOrder, saveOrder, notifyPaid } from '../_lib/shop.js';
import { getPayment, isPaid, isFailed } from '../_lib/dibsy.js';

// Dibsy calls this when a payment changes. The body is not trusted:
// the payment status is always re-read from Dibsy with the secret key.
export async function onRequestPost({ env, request }) {
  const url = new URL(request.url);
  const order = await readOrder(env, url.searchParams.get('order'));
  if (!order || !order.paymentId) return new Response('ok');

  const payment = await getPayment(env, order.paymentId);
  if (isPaid(payment.status) && order.status !== 'paid') {
    order.status = 'paid';
    order.paidAt = new Date().toISOString();
    await saveOrder(env, order);
    await notifyPaid(env, order);
  } else if (isFailed(payment.status) && order.status === 'pending') {
    order.status = 'failed';
    await saveOrder(env, order);
  }
  return new Response('ok');
}
