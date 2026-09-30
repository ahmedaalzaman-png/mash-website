import { json, loadCatalog, onlineReady } from '../_lib/shop.js';

// Tells the page whether online payment is switched on.
export async function onRequestGet(context) {
  const catalog = await loadCatalog(context);
  return json({ online: onlineReady(context.env), delivery: catalog.delivery || null });
}
