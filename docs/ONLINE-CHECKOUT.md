# Online checkout: switching it on

The code is in the repository and already works in testing. Online payment stays
hidden on the live site until the steps below are done; until then customers
order on WhatsApp exactly as before.

## 1. Dibsy account (Mash)
Sign up at dibsy.one with the Commercial Registration, Qatar bank account and
owner ID. From the dashboard, copy the **test** secret key first, then later
the **live** one.

## 2. Move hosting to Cloudflare Pages (free)
GitHub Pages can only serve files; the payment code needs Cloudflare Pages.
1. Create a free account at dash.cloudflare.com.
2. Workers & Pages → Create → Pages → Connect to Git → pick `mash-website`.
   Framework preset: None. Build command: empty. Output directory: `/`.
3. Workers & Pages → KV → Create namespace `mash-orders`.
4. The Pages project → Settings → Bindings → Add KV namespace:
   variable name `ORDERS`, namespace `mash-orders`.
5. Settings → Variables and secrets (Production), add:
   - `DIBSY_SECRET_KEY` (secret) – from Dibsy
   - `ORDER_EMAIL` – where new-order emails go
   - `RESEND_API_KEY` (secret, optional) – from resend.com, for order emails
   - `FROM_EMAIL` (optional) – e.g. `Mash <orders@bymashqatar.com>`
6. Redeploy. Test on the `*.pages.dev` address with the Dibsy test key.

## 3. Point the domain at Cloudflare
Pages project → Custom domains → add `bymashqatar.com` and `www.bymashqatar.com`,
and follow the DNS instructions (easiest: move the domain's nameservers from
Namecheap to Cloudflare). Then turn off GitHub Pages in the repository settings.

## 4. Go live
Swap the test key for the live key, redeploy, and place one small real order.

## Where things live
- `catalog.json` – every abaya, price, sold-out flag, delivery fee (25 QR, free over 2,000 QR).
  Prices are always read from here on the server, never from the browser.
- `functions/_lib/dibsy.js` – the only Dibsy-specific code. Check it against
  Dibsy's API docs with the test key (base URL, amount format, checkout link field).
- `functions/api/checkout.js` – creates the order and the Dibsy payment.
- `functions/api/webhook.js` – Dibsy's "payment changed" notice; re-checks the
  payment with Dibsy, marks the order paid, sends the emails.
- `functions/api/order.js` – status for the confirmation page `order.html`.
- `policies.html` – delivery, returns and terms. Draft: Mash must review it.
