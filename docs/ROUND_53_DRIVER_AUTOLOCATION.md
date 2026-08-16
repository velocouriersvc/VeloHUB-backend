# Round 53 - Marker clustering (admin map) + driver signup auto-location

## 1. Admin Live Map: cluster merchant pins (`velo-admin`)

Dense merchant areas were unreadable. Wrapped the merchant layer in `@googlemaps/markerclusterer`
(`src/pages/LiveMap.jsx`): merchant markers are created off-map and added to a `MarkerClusterer` kept in a
ref; each redraw calls `clearMarkers()` and re-adds. Dense areas collapse into counts that split apart on
zoom; driver and order layers stay individual (live, fewer). Click InfoWindow + side card behavior unchanged.
Deployed via push to `main` (GH Actions).

## 2. Driver registration: auto-detect location, remove the region dropdown

The "Operating Location (Region)" dropdown used `getRegionsByCountry`, which only lists Ghana regions, so it
broke for every other country. It is replaced with automatic detection (country + latitude + longitude),
mirroring the merchant setup.

App (`VeloHUB`, `app/(auth)/role-setup/driver.tsx`):
- Removed the region `SelectMenu` and the `getRegionsByCountry`/`getRegionLabel` imports.
- `detectLocation()` + an on-mount effect: `Location.requestForegroundPermissionsAsync` ->
  `getCurrentPositionAsync` -> `reverseGeocodeAsync`, storing a readable address `location` label +
  `latitude` + `longitude` in the setup store.
- A read-only "Operating Location" row shows the detected address (or "Detecting your location...") with a
  "Use my location" retry. `handleComplete` requires coordinates (Alert otherwise) and sends
  `latitude`/`longitude` to `/profile/driver`.
- `driverSchema.location` is now optional; `SetupDriverProfileRequest` carries `latitude?`/`longitude?`.

Backend (`develop` -> `main`):
- `DriverProfile` gains nullable `latitude`/`longitude` (`double precision`, auto-added by `DB_SYNCHRONIZE`).
- `DriverSetupPayload` gains `latitude?`/`longitude?`; `setupDriverProfile` persists them (mirrors the merchant
  path). `region` now holds the detected address label; `User.country` still saves from `country_code`.

## Verification

- Backend `tsc` clean; app `npx tsc --noEmit` = 0 errors; admin `npm run build` (vite) passes with clustering.
- Backend deployed `develop` -> `main`; admin pushed `main`. App committed to `master`.
- No em/en dashes in any touched file.

## Deploy note

The driver-signup change reaches devices only through a **new EAS build (no OTA)**. The clustering and backend
coordinate storage are live immediately; the app fix needs a build/submit. (Scope: driver only - buyer/merchant
still use the region field.)
