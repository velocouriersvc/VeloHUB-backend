# Round 25 fixes - Android nav directions, service chat visibility, driver earnings/jobs, order-details

Date: 2026-07-26

Four tester issues, each root-caused against live code + the production cluster + the Directions API.

## 1. Android live navigation showed no directions ("0.0 km") [app]
`MapViewDirections` used `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, which is empty in builds (not in
`eas.json`, no committed `.env`), so the Directions request returned nothing. The native Google Maps
key embedded via `app.json` renders the tiles AND works for the Directions REST API (verified live:
status OK, 3.3 km). Fix: a shared `constants/maps.ts` `getMapsApiKey()` returns the env var if set,
else the embedded `Constants.expoConfig.android.config.googleMaps.apiKey` (ios fallback). Applied to
`navigation.tsx`, `checkout.tsx`, `RideMap.tsx`, `RideTracking.tsx`, `ScheduleRideModal.tsx`. Also set
`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` in `eas.json` production env.

## 2. Service booking chat never showed messages [app]
Backend proven correct (getMessages returns every message to both participants in either phone
format; messages persist). The bug: in `app/chat/[id].tsx` the `FlatList` had no `flex: 1` (its
loading/error siblings did), so inside the flex `KeyboardAvoidingView` it collapsed to ~0 height and
the messages (and empty-state) were invisible while the composer still showed. Fix: `style={{ flex: 1 }}`
+ `flexGrow: 1` on the content container. Matches the working ride chat modal pattern.

## 3. Driver dashboard earnings != wallet; completed jobs stuck at 2 [backend + app]
`getDriverPublicStats.completedTrips` counted completed RIDES only and `totalEarnings` summed ride
payouts (47.34), neither counting deliveries nor matching the wallet (40.55). The driver did 2 rides +
1 delivery = 3. Fix: completedTrips now counts completed rides + completed/delivered orders; the stats
return + `/driver/stats` now include `availableBalance` (wallet balance); the dashboard earnings pill
shows `availableBalance` so it equals the wallet screen. `withDriverStats` strips `availableBalance`
(private). Verified against prod data: 3 completed, balance 40.55.

## 4. Merchant order-details: Order Details instead of Customer Details [app]
Replaced the "Customer Details" block (Name / Phone / Delivery Address) in
`app/(seller-tabs)/order-details.tsx` with an "Order Details" block showing Order ID (`formattedId`)
and Product Ordered (items summary), per `files/issues/change-issue.jpeg`.

## Ship
Backend -> develop -> main (CI auto-deploy). App: fresh production build from master. `app.json`
bumped to v1.1.4 / versionCode 18 (profile screen shows the version). tsc + jest green; no em dashes.
