# Round 52 - Move the map to the admin dashboard as an interactive Live Map

The customer web app's Coverage map was removed and rebuilt in `velo-admin` as a real analytics tool: Google
Maps (same key as the mobile app) with clickable pins that reveal full details, live data, and killer features.

## Backend (`develop` -> `main`)

- `RedisLocationService.getOnlineDriverStates()` - live driver identity + coords + heading + status (scans
  `driver:location:*`).
- `admin-service`:
  - `getMapLive()` -> `{ drivers, orders, stats }`. drivers = online drivers joined with User/DriverProfile
    (name, phone, vehicle, plate, region, status). orders = active rides + active product orders joined with
    customer/driver (+ merchant for orders) -> `{ id, kind, status, customerName/Phone, driverName, amount,
    currency, pickup{lat,lng,address}, dropoff{lat,lng,address} }`. stats = { onlineDrivers, activeOrders,
    merchants, users, usersByCountry }.
  - `getMapMerchants()` -> merchants with coordinates + business details (businessName, category, ownerName,
    phone, city=region, country=owner country, status, address, lat, lng).
- `AdminController` + `adminRoutes`: `GET /admin/map/live` and `GET /admin/map/merchants` (admin role only).

## Web (`velocouriersvc.com/dashboard.html`, deployed via `vercel --prod`)

- Removed the Coverage tab, `#mapView`, the map CSS, and all its Google Maps JS. Shop + All Categories remain.

## Admin (`velo-admin`, push `main` -> GH Actions auto-deploy)

- `src/lib/googleMaps.js` - one-time Google Maps JS loader (key from `VITE_GOOGLE_MAPS_API_KEY`, public
  fallback), with a `gm_authFailure` reject so an unauthorized key surfaces clearly.
- `src/api/base44Client.js` - `base44.map.live()` / `base44.map.merchants()`.
- `src/pages/LiveMap.jsx` - new `/live-map` page. Google map with layers: online drivers, merchants, and
  active orders (pickup marker + customer dropoff marker + connecting polyline). Every pin is clickable ->
  InfoWindow + a side detail card (driver/merchant/order-customer details) with a deep-link (Open profile ->
  `/users`, View order -> `/orders`). Killer features: live stats header (online drivers / active orders /
  merchants / users), layer toggle chips with live counts, a demand heatmap over order pickups (visualization
  library), a coverage overlay, a Places search to fly anywhere, and ~12s live refresh. Registered in
  `index.jsx` + a "Live Map" nav item in `Layout.jsx`.

## Verification

- Backend `tsc` clean; live `GET /admin/map/live` -> 50 active orders, stats (132 merchants, 658 users,
  per-country breakdown); `GET /admin/map/merchants` -> 128 merchants with coords + details; both 400 without
  an admin phone (protected). Web: Coverage tab/JS gone on the deployed site; `node --check` clean. Admin:
  `npm run build` (vite) passes; pushed to `main` for GH Actions deploy. No em/en dashes anywhere.
- GCP note: the Maps key needs the **Maps JavaScript API** enabled and this admin origin allowed; the loader's
  `gm_authFailure` surfaces the exact issue if not.
