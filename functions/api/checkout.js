import { json, loadCatalog, onlineReady, buildOrder, newOrderId, saveOrder } from '../_lib/shop.js';
import { createPayment } from '../_lib/dibsy.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!onlineReady(env)) return json({ errors: ['Online payment is not available yet. Please order on WhatsApp.'] }, 503);

  let input;
  try { input = await request.json(); } catch (e) { return json({ errors: ['Something went wrong. Please try again.'] }, 400); }

  const catalog = await loadCatalog(context);
  const built = buildOrder(catalog, input);
  if (built.errors.length) return json({ errors: built.errors }, 422);

  const origin = new URL(request.url).origin;
  const order = {
    id: newOrderId(), status: 'pending', createdAt: new Date().toISOString(),
    items: built.items, customer: built.customer,
    subtotal: built.subtotal, delivery: built.delivery, total: built.total,
  };

  try {
    const payment = await createPayment(env, {
      amountQAR: order.total,
      description: `Mash order ${order.id}`,
      redirectUrl: `${origin}/order.html?id=${order.id}`,
      webhookUrl: `${origin}/api/webhook?order=${order.id}`,
      metadata: { orderId: order.id },
    });
    order.paymentId = payment.id;
    await saveOrder(env, order);
    return json({ orderId: order.id, checkoutUrl: payment.checkoutUrl });
  } catch (e) {
    console.error(e);
    return json({ errors: ['The payment page could not be opened. Please try again, or order on WhatsApp.'] }, 502);
  }
}
