# Round 30 - one-tap Apply offers + real food delivery ETAs

Date: 2026-07-29

Two customer-app asks.

## 1. Offers: tap Apply instead of copying a code; it auto-discounts and disappears
The Offers screen (`app/offers/index.tsx`) was copy-only with hardcoded codes, and the app
never sent a `promoCode` at checkout. The backend already had the discount pipeline
(`OrderService.getQuote`/checkout + `applyPromoCode`); the checkout receipt already rendered a
`discount` line.

Backend (`VeloHUB-backend`):
- `order-service.ts` `applyPromoCode`: enforce `categoryRestriction` (case-insensitive vs the
  merchant's `category`) and add a `free_delivery` discount type that waives the delivery fee
  (`discount = deliveryFee`, so the total nets it to 0). `getQuote` passes `deliveryFee` and
  `merchant.category` through.
- `scripts/seed-promo-codes.ts` (idempotent, wired into `run-seeds.ts`): seeds real codes so the
  discount is genuine:
  - `VELOHUB50`: 50% off, `categoryRestriction` Pharmacy, orders.
  - `FREEDEL`: free delivery, Restaurant, `minOrderValue` 50, orders.
  - `SMARTRIDE`: fixed 10, rides (seeded for realism; not surfaced for Apply yet).
  Category values match the real `merchant_profiles.category` vocabulary (Pharmacy, Restaurant, ...).

App (`VeloHUB`):
- `utils/applied-promo.ts` (AsyncStorage, single active promo): get/set/clear.
- `app/offers/index.tsx`: order offers show an "Apply offer" button that stores the promo and hides
  the offer from the list; the ride offer keeps copy. Refreshes on focus so a removed promo brings
  the offer back.
- `app/checkout.tsx`: loads the applied promo, sends `promoCode` in the quote + both checkout
  payloads, shows an applied-promo chip with Remove, and a "not applicable to this order" note when
  the quote returns `promoApplied: false`.

Scope: auto-apply targets food/marketplace/pharmacy ORDER checkout only. Rides (SMARTRIDE) is a
follow-up (the ride booking flow has no promo pipeline yet).

## 2. Food cards: real, Bolt-style delivery ETAs
`app/food/index.tsx` restaurant + dish cards had no ETA. Added `utils/eta.ts`
(`haversineKm` + `formatEtaRange` using the same `ceil(distanceKm*3+10)` formula as the backend
delivery estimate) and show a time window (e.g. "20-30 min") computed from the user's location to
each merchant (`merchant.merchantProfile.latitude/longitude`, already in the product response). The
chip is hidden when the user's location or a merchant's coordinates are missing.

## Verify
- Backend + app `tsc` clean; no em dashes on touched files.
- Live: `promo_codes` seeded on boot; `POST /marketplace/orders/quote` with `VELOHUB50` on a
  Pharmacy cart returns `discount > 0` / `promoApplied: true`; `FREEDEL` on a Restaurant delivery
  cart >= 50 nets the delivery fee to 0; a category mismatch returns `promoApplied: false`.
- Product API returns `merchantProfile.latitude/longitude`, so ETAs render.
- Ship: app -> `master` (fresh eas build, version 1.1.4); backend -> `develop` -> `main` (deployed;
  seed runs on boot).
