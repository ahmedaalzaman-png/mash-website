// Shared helpers: catalogue loading, cart validation, order storage, email.

export const SIZES = ['S', 'M', 'L', 'XL'];

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function loadCatalog(context) {
  const url = new URL('/catalog.json', context.request.url);
  const res = await context.env.ASSETS.fetch(url);
  if (!res.ok) throw new Error('Catalogue unavailable');
  return res.json();
}

export function onlineReady(env) {
  return Boolean(env.DIBSY_SECRET_KEY && env.ORDERS);
}

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

// Rebuild the order from the catalogue. Prices from the browser are ignored.
export function buildOrder(catalog, input) {
  const errors = [];
  const byCode = Object.fromEntries(catalog.products.map((p) => [p.code, p]));
  const lines = Array.isArray(input.lines) ? input.lines.slice(0, 20) : [];
  if (!lines.length) errors.push('Your cart is empty.');

  const items = [];
  for (const l of lines) {
    const p = byCode[l && l.code];
    if (!p) { errors.push('One of the pieces in your cart is no longer available.'); continue; }
    if (p.soldOut) { errors.push(p.code + ' is sold out. Please remove it from your cart.'); continue; }
    if (!p.priceQAR) { errors.push(p.code + ' is priced on request. Please order it on WhatsApp.'); continue; }
    const size = String(l.size || '');
    const length = Number(l.length);
    const qty = Math.floor(Number(l.qty));
    if (!SIZES.includes(size)) errors.push('Choose a size for ' + p.code + '.');
    if (!(length >= 51 && length <= 61 && (length * 2) % 1 === 0)) errors.push('Choose a length between 51 and 61 inches for ' + p.code + '.');
    if (!(qty >= 1 && qty <= 10)) errors.push('Quantity for ' + p.code + ' must be between 1 and 10.');
    items.push({
      code: p.code, name: p.name || '', size, length, qty,
      note: clean(l.note, 300), unitQAR: p.priceQAR, lineQAR: p.priceQAR * (qty || 0),
    });
  }

  const c = input.customer || {};
  const customer = {
    name: clean(c.name, 80),
    phone: clean(c.phone, 20).replace(/[^\d+]/g, ''),
    email: clean(c.email, 120),
    area: clean(c.area, 80),
    address: clean(c.address, 300),
    notes: clean(c.notes, 300),
  };
  if (customer.name.length < 2) errors.push('Enter your full name.');
  if (!/^(\+?974)?\d{8}$/.test(customer.phone)) errors.push('Enter a Qatar mobile number (8 digits).');
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) errors.push('Check your email address.');
  if (!customer.area) errors.push('Enter your area.');
  if (customer.address.length < 5) errors.push('Enter your delivery address.');

  const subtotal = items.reduce((n, i) => n + i.lineQAR, 0);
  const d = catalog.delivery || {};
  const delivery = d.freeOver && subtotal >= d.freeOver ? 0 : Number(d.fee || 0);
  return { errors: [...new Set(errors)], items, customer, subtotal, delivery, total: subtotal + delivery };
}

export function newOrderId() {
  const d = new Date();
  const ymd = d.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return 'MASH-' + ymd + '-' + rand;
}

export async function saveOrder(env, order) {
  await env.ORDERS.put('order:' + order.id, JSON.stringify(order), { expirationTtl: 60 * 60 * 24 * 365 });
}

export async function readOrder(env, id) {
  if (!/^MASH-\d{6}-[0-9A-F]{6}$/.test(id || '')) return null;
  const raw = await env.ORDERS.get('order:' + id);
  return raw ? JSON.parse(raw) : null;
}

// ---- Email (optional: only sends when RESEND_API_KEY is set) ----
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const qar = (n) => n.toLocaleString('en-US') + ' QR';
const lenLabel = (l) => String(l).replace(/\.0$/, '') + '"';

export function orderText(order) {
  const lines = order.items.map((i) =>
    `• ${i.code}${i.name ? ' ' + i.name : ''}${i.qty > 1 ? ' × ' + i.qty : ''}, size ${i.size}, length ${lenLabel(i.length)} – ${qar(i.lineQAR)}` +
    (i.note ? `\n  Custom: ${i.note}` : ''));
  return [
    ...lines,
    `Subtotal: ${qar(order.subtotal)}`,
    `Delivery: ${order.delivery ? qar(order.delivery) : 'Free'}`,
    `Total paid: ${qar(order.total)}`,
    '',
    `${order.customer.name} · ${order.customer.phone}${order.customer.email ? ' · ' + order.customer.email : ''}`,
    `${order.customer.area}, ${order.customer.address}`,
    order.customer.notes ? `Notes: ${order.customer.notes}` : '',
  ].filter((x) => x !== '').join('\n');
}

async function sendEmail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !to) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.FROM_EMAIL || 'Mash <orders@bymashqatar.com>',
      to: [to],
      subject,
      html: '<pre style="font:14px/1.6 -apple-system,Segoe UI,Arial,sans-serif;white-space:pre-wrap">' + esc(text) + '</pre>',
    }),
  });
  return res.ok;
}

export async function notifyPaid(env, order) {
  const body = orderText(order);
  await sendEmail(env, env.ORDER_EMAIL, `New paid order ${order.id} – ${qar(order.total)}`, `Order ${order.id}\n\n${body}`);
  if (order.customer.email) {
    await sendEmail(env, order.customer.email, `Your Mash order ${order.id}`,
      `Thank you for your order.\n\nOrder ${order.id}\n\n${body}\n\nMash will contact you on WhatsApp to arrange delivery.\nQuestions: wa.me/97451696699`);
  }
}
