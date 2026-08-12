# Round 43 - Web app address autocomplete + live drivers on the coverage map

Two web-app improvements (`velocouriersvc.com/dashboard.html`; the user uploads to Vercel). One small
backend addition; the rest is web-only. No emoji, no "-" em/en dashes.

## Issue 1 - Pickup/dropoff address autocomplete (web only)

Before, the ride and package drawers took plain-text pickup/dropoff and sent FAKE coordinates (the hub
center + a hardcoded 0.03 degree offset), so fares/distance were wrong.

- Added a reusable `attachPlaces(input, onPick)` helper: debounced (>=3 chars) call to the backend
  `GET /places/autocomplete?input=` (Google-backed), a styled dropdown of predictions (keyboard + mouse
  select), and on select a `GET /places/details/:placeId` that stores the real `{lat,lng}` on the input's
  `data-lat/data-lng` and clears them if the user edits the text again. Reuses the existing `api()` + `esc()`.
- Wired to the ride inputs `#rPick`/`#rDest` and package inputs `#pPick`/`#pDrop`. The request builders now
  send the geocoded coordinates:
  - Ride (`/rides/request`): pickup uses the picked coords, else precise GPS (`state.coords`), else the hub;
    the dropoff REQUIRES a picked suggestion (otherwise an inline "Choose a destination from the suggestions").
  - Package (`/checkout` package_ride): same coord handling, and it now calls `POST /places/distance` to send
    the REAL `distanceKm`/`durationMin` (falling back to a rough estimate only if that lookup fails), instead
    of the old hardcoded 5 km / 20 min.
- No backend change (the `/places/*` endpoints already existed and were verified live: autocomplete returns
  predictions, details returns lat/lng, distance returns distanceKm/durationMin). They require a buyer/driver
  `x-user-phone`, which the already-`requireAuth`-gated booking flow provides via the session.

## Issue 2 - Live driver pins on the coverage map (backend + web)

"Mimic the driver's app, add signed up users." Decision: plot live online drivers + merchants (customers have
no stored coordinates). Merchants were already plotted from `GET /products`; this adds live driver pins.

- Backend (one small PUBLIC endpoint, api-key-only, like `/products`):
  - `redis-location-service.getOnlineDriverPoints()` scans `driver:location:*` (5-min TTL) and returns
    `{lat,lng}` **coarsened to 3 decimals (~110 m) with no driver identity** - a privacy guard so a public
    map cannot precisely track an individual driver.
  - `MapController.getLive` + `src/routes/mapRoutes.ts` (`apiKeyMiddleware` only) -> `GET /api/v1/map/live`
    returns `{ drivers: [{lat,lng}] }`. Mounted in `src/index.ts` at `/api/v1/map`.
- Web (`dashboard.html`): `loadCoverDrivers()` (clones `loadCoverMerchants`) fetches `/map/live` and plots each
  as a green `L.circleMarker` (`#16A34A`, radius 8, white ring) in a `_driverLayer`; called from
  `initCoverMap()`. Added an "Online driver" legend row and updated the caption.

## Verification (E2E, live)

- Backend `tsc --noEmit` clean. `GET /api/v1/map/live` -> `200 {"drivers":[]}` (0 drivers online now, correct).
- `/places/autocomplete?input=Accra Mall` -> 5 predictions; `/places/details/:id` -> lat 5.6221, lng -0.1733;
  `POST /places/distance` -> `{distanceKm:3.34,durationMin:7.67}`.
- `dashboard.html` inline JS parses (`node --check`); no emoji; no "-" em/en dashes.
- (Could not stage a live driver pin - the guest account can't go on duty as a driver - but the endpoint shape
  is correct and the web plotting reuses the proven merchant-pin path; real drivers appear when they go online.)

## Deploy

- Backend: `develop` -> `main` (deployed; `/map/live` live). App: the USER uploads `dashboard.html` to Vercel.
