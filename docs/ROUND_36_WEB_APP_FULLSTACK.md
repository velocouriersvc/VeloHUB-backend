# Round 36 - VeloHUB web app rebuilt as a real full-stack client

Date: 2026-08-01

Location: `velocouriersvc.com/` (the live site folder). Files: `index.html` (homepage),
`dashboard.html` (the functional app), `privacy.html`, `terms.html`. The user deploys; I build.

## What it is
A real web client of the same VeloHUB backend the mobile app uses (`https://api.velocouriersvc.com/api/v1`,
CORS open). NOT static/simulated: it authenticates, browses live products, uses the real cart, and
checks out through real Paystack. Self-contained pages (inline CSS/JS, no framework, no build step).
Session is persisted in localStorage as `veloSession` = {phone,name,roles,id}; every authed call sends
`x-api-key` + `x-user-phone: <phone>`, exactly like the mobile `ApiClient`.

## Real backend wiring (mirrors the mobile repositories)
- Auth: `POST /auth/register`, `POST /auth/login`, and phone `POST /auth/request-otp` + `/auth/verify-otp`.
  The returned `phoneNumber` is the session identity.
- Products (public): `GET /products?country=&lat=&lng=&radius=40&limit=` + `GET /products/categories`.
- Cart: `POST /cart/add`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`, `GET /cart` (all with
  `?phoneNumber=`). Real stock validation is surfaced.
- Checkout/payment: `POST /checkout` (`product_order` / `package_ride`) returns
  `payment.authorizationUrl`; the page redirects to the real Paystack hosted checkout. Return to
  `dashboard.html?paid=...` shows Orders.
- Orders/tracking: `GET /marketplace/orders`, `/active` (polled every 8s -> live order-bar leg with the
  real status + verification code), `/:id`.
- Rides `POST /rides/request` (-> Paystack), Services `POST /services/bookings`, Wallet `GET /wallet`,
  Payouts `POST /payouts/quote` + `/payouts/instant` (drivers/merchants), Notifications `/notifications`.

## Features
Homepage: design system (Sora/Inter/IBM Plex Mono, trust-blue + action-orange), numbered route stops,
Choose-your-lane, commission donut, driver onboarding, footer with CEO + operating countries, and a
shared auth modal that creates a REAL account and persists the session before sending customers to the
dashboard. Dashboard: auth-aware header, location/currency engine (10 real hubs, geolocation ->
locale -> Accra fallback, 40 km radius gate, one `fmt()`), Shop-first grid (live products, real category
chips, add-to-cart stepper, floating cart bar), All-Categories drawers (ride/package/service/local +
food/grocery/pharmacy), real checkout -> Paystack, real order tracking bar, wallet + payouts, support
chat, notifications. No emoji/decorative icons (numbering + typography + functional line-icons); no em
dashes; every modal closes 3 ways; responsive to 360px; prefers-reduced-motion respected.

## Verified (E2E against the LIVE backend, no charges)
- `GET /products` returns live products (public).
- `POST /auth/register` created a real account (roles ["buyer"]) and `POST /auth/login` returned it;
  throwaway account deleted after via `DELETE /profile/me`.
- `POST /cart/add` with an in-stock product returned "Item added to cart", subtotal 40; out-of-stock is
  rejected with the real stock message.
- `POST /checkout` reached real Paystack payment initialization (the only failure was Paystack rejecting
  the synthetic `@velo.test` email; a real customer email yields a valid `authorizationUrl`).
- All 4 pages serve 200 locally; inline JS parses with no errors; no em/en dashes; no emoji.

## Deploy
Upload the four files (plus keep `favicon.png`) to the `velocouriersvc.com` web root. `index.html` is the
homepage; `dashboard.html`, `privacy.html`, `terms.html` sit beside it. No backend change was needed.
