# Round 47 - US ride fares: 15% cut + fixed the surge-cap bug that collapsed all US fares

## What the team saw

They lowered the US fares in the admin dashboard but "everything reset." Two things were going on:

1. The admin vehicle-pricing edits DID persist (the version-guarded seed preserves them; the earlier
   "reset" was the one-time v1 -> v2 price-book rollout). Verified live: US rows were the edited values and
   survived deploys.
2. **The real problem (critical):** US `platform_settings` had `maxSurgeMultiplier = 0` (and
   `globalSurgeMultiplier = 0`). `fare-service` caps the surge at `maxSurgeMultiplier`, so the effective
   surge was `min(1.0, 0) = 0`, and `Surged = Subtotal x 0` collapsed EVERY US fare to its minimum fare
   (a 5 km car ride charged $1.70 instead of $8.15). So editing base/per-km had no visible effect - the
   estimate always floored to the minimum, which looked like the fares "reset."

## Changes

1. **US fares -15%** (live via the admin API `PATCH /admin/vehicle-pricing/:id`, and mirrored into the seed
   so it is reset-proof): base / perKm / perMin / minFare / bookingFee ->
   bike 0.85/0.34/0.09/0.85/1.28, car 1.57/0.55/0.17/1.70/2.13, priority 2.13/0.89/0.37/3.19/2.98,
   suv 3.83/1.29/0.47/4.68/4.68, truck 8.50/1.98/0.60/10.20/6.80.
   - `seed-vehicle-pricing.ts`: `US_PRICING` set to these explicit values (+ explicit US priority row);
     dropped the now-unused `perMile` helper. No `PRICING_SEED_VERSION` bump (other markets untouched), so a
     future version bump can never revert US to the old higher fares.

2. **Surge-cap fix (data + code):**
   - Data: set US `globalSurgeMultiplier = 1.00`, `maxSurgeMultiplier = 1.40` (matching GH/DEFAULT) via
     `PUT /admin/settings/US`.
   - Code (defensive, `fare-service.ts`): floor the surge cap at 1.0 -
     `const maxSurge = Math.max(1, ...)` - so a misconfigured `maxSurgeMultiplier` of 0 can NEVER collapse
     fares again for any market.

## Verification (live)

- `GET /admin/vehicle-pricing?country=US` shows the 15%-lower values; GH unchanged.
- `POST /rides/estimate` (US, 5 km / 10 min): now `surgeMultiplier = 1` and full fares
  (bike $4.97, car $8.56, priority $13.92, suv $20.64, truck $32.76) - previously all collapsed to the
  minimum. GH estimates unchanged. Backend `tsc` clean; no em/en dashes.

## Deploy

- Data (fares + US surge): applied immediately via the admin API.
- Code (seed source + surge-cap floor): backend `develop` -> `main`. No app/admin build.
