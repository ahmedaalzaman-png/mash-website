import { json, readOrder, saveOrder, notifyPaid } from '../_lib/shop.js';
import { getPayment, isPaid, isFailed } from '../_lib/dibsy.js';

// Used by the order page after the customer returns from Dibsy.
export async function onRequestGet({ env, request }) {
  const order = await readOrder(env, new URL(request.url).searchParams.get('id'));
  if (!order) return json({ error: 'Order not found' }, 404);

  if (order.status === 'pending' && order.paymentId) {
    try {
      const payment = await getPayment(env, order.paymentId);
      if (isPaid(payment.status)) {
        order.status = 'paid'; order.paidAt = new Date().toISOString();
        await saveOrder(env, order); await notifyPaid(env, order);
      } else if (isFailed(payment.status)) {
        order.status = 'failed'; await saveOrder(env, order);
      }
    } catch (e) { console.error(e); }
  }
  return json({
    id: order.id, status: order.status, total: order.total, subtotal: order.subtotal, delivery: order.delivery,
    items: order.items.map(({ code, name, size, length, qty, lineQAR }) => ({ code, name, size, length, qty, lineQAR })),
    firstName: order.customer.name.split(' ')[0],
  });
}
