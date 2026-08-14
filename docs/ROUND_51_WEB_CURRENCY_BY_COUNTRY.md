# Round 51 - Web currency by country (fix "US address detecting CAD")

## Problem

A US address (Westfield, Indiana) showed CAD. The web resolved the market with `nearestHub()` - the
geographically closest of the 10 hubs by raw distance - and Indiana is closer to the Toronto hub (~700 km)
than the New York hub (~1030 km), so it landed on Canada and displayed CAD. Currency must follow the
address's real country, not raw distance.

## Backend (`develop` -> `main`)

- `places-service.getPlaceDetails` and `reverseGeocode` now parse the ISO2 `country` + `city` from Google
  `address_components` and return `currency` via the existing `currencyForCountry(country)` (`utils/currency`).
  `getPlaceDetails` adds `address_components` to the requested Google `fields`; `reverseGeocode` returns
  `{ address, country, city, currency }` (kept `address` as the string key - additive; only the web reads
  these, the mobile app uses Expo's client geocoder).
- `/places/reverse-geocode` is now public (api-key only, like autocomplete/details) so anonymous web GPS can
  resolve its country/currency before sign-in. Only `/places/distance` stays role-gated.

## Web (`dashboard.html`, deployed via `vercel --prod`)

- `attachPlaces` passes the picked place's `country`/`currency`/`city` to `onPick`, and stores them as
  `data-*` on the input.
- New `applyMarket(...)`/`marketFor(...)`: the active market is built from the resolved COUNTRY
  (`state.hub = { country, city, cur, lat, lng }`) using the precise picked coordinates, so nearby stores
  still rank to the exact spot while currency + the `/products` country come from the real country. Falls back
  to `nearestHub` only when no country is available. The resolved market is persisted as `veloHub` and
  restored on load (no more re-deriving via `nearestHub`).
- `detectGPS` and the init GPS probe call `/places/reverse-geocode` to resolve the country/currency from the
  device's coordinates.

## Verification (live)

- `GET /places/details` (Westfield IN) -> `country:US, currency:USD, city:Westfield`; Toronto -> `CA/CAD`;
  Accra -> `GH/GHS`. Anonymous `POST /places/reverse-geocode` at Indiana coords -> `US/USD` (public, no
  x-user-phone). Deployed web carries the new logic. Backend `tsc` clean; no em/en dashes.
