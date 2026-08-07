# Round 38 - show distance (km) to the merchant on every listing (app + web)

Date: 2026-08-07

## Request
Show the distance in km from the customer to the merchant on each listing (product, food, grocery,
pharmacy, marketplace, service).

## Approach (no backend change)
The data is already present: `/products` returns each product with
`merchant.merchantProfile.latitude/longitude` (model has no `@Exclude`; `product-service.getProducts`
joins `merchantProfile`), and both clients already have the customer location + a Haversine helper. So
this is display-only, reusing what each client already computes for the delivery ETA.

## Mobile app (VeloHUB, master; ships via eas build)
- `utils/eta.ts`: added `formatDistance(km)` ("2.3 km", "<0.1 km" guard) and `formatDistanceEta(km)`
  ("2.3 km · 20-30 min").
- `app/food/index.tsx`: its `etaFor` now returns `formatDistanceEta`, so every food store/dish card shows
  distance + ETA.
- `app/grocery/index.tsx`, `app/pharmacy/index.tsx`, `app/services/index.tsx`,
  `app/marketplace/[category].tsx`, and `app/food|grocery|pharmacy/[category].tsx`: added a small
  `merchantWithDist(name, lat, lng)` helper (reuses `haversineKm` + the screen's `userLocation`) and
  appended `" · 2.3 km"` to the merchant label on store and product/service cards (marketplace and the
  [category] screens gained the merchant+distance line on product cards). Falls back to just the name
  when coordinates or the user location are missing.

## Web dashboard (velocouriersvc.com/dashboard.html; redeployed to Vercel)
- Added `distFor(p)` using the existing `haversine()` from the customer origin (`state.coords` if set,
  else the active hub) to `p.merchant.merchantProfile.latitude/longitude`; the product card now shows
  "2.3 km · Delivery 20-40 min". Also fixed `merchantOf` to read the real `merchantProfile.businessName`.

## Verified
- Live `/products` returns `merchant.merchantProfile.latitude/longitude` (drives both clients).
- App `tsc` clean across all 8 touched screens + `utils/eta`; no em dashes (the separator is a middle
  dot "·", not an em dash).
- Web: `dashboard.html` JS parses; redeployed to Vercel prod (READY) and the live page contains the
  distance wiring. App shipped to `master`; needs a fresh `eas build` for the app cards.
