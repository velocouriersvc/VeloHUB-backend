# Round 49 - US fare recalibration (competitor parity + compressed tiers)

## What the team reported

US ride fares looked far too high in the app (screenshot: Velo Go $112, Standard $165, Priority $206,
Premium $224, Truck $342) versus Uber/Lyft on the same route ($54-85). The concern: the charge to the
customer, and Priority/Premium/Truck sitting too far above Standard. "Only US - Ghana and Nigeria look fine."

## What was actually happening

- The **backend tier mapping is correct** (Velo Go=bike, Velo Standard=car, Velo Priority=priority,
  Velo Premium=SUV, Velo Truck=truck), verified live - so there was no "bike recorded as standard" bug.
- The **screenshot reflected stale/old pricing**: current live fares were already much lower than the
  screenshot and did not match it at any distance (its tier ratios matched the old April-2026 migration book,
  not what was live).
- The real, valid issue: the live tiers were **too spread out** - Go/Standard were fine but Priority,
  Premium and Truck climbed far above Standard as distance grew (at 60 km: Standard $61 but Priority $110,
  Premium $152, Truck $220). The client wants them **compressed** toward Standard.

## Change - competitor-parity US rates with compressed tiers

Calibrated the five US rows so a typical ~30-35 km ride lands every tier in the client's target bands
(Go 45-50, Standard 60-70, Priority 70-80, Premium 80-100, Truck 120-150), anchored to the Uber/Lyft
benchmark. Tier spread compressed from ~6x (Go->Truck) to ~2.9x. New USD rates
(base / perKm / perMin / minFare / bookingFee):

- bike     (Velo Go):       1.58 / 0.90 / 0.24 / 6.50  / 1.98
- car      (Velo Standard): 2.20 / 1.25 / 0.33 / 9.00  / 2.75
- priority (Velo Priority): 2.53 / 1.44 / 0.38 / 10.35 / 3.16
- suv      (Velo Premium):  3.04 / 1.73 / 0.46 / 12.40 / 3.80
- truck    (Velo Truck):    4.58 / 2.60 / 0.69 / 18.70 / 5.72

Applied two ways (same pattern as Round 47):

1. **Live DB** via the admin API (`PATCH /admin/vehicle-pricing/:id`) for all 5 US rows - immediate, and the
   version-guarded seed preserves it across deploys.
2. **Seed source** (`src/scripts/seed-vehicle-pricing.ts` `US_PRICING`) updated to match, so US can never reset
   to old values on a future `PRICING_SEED_VERSION` bump. No version bump (other markets untouched). India is
   derived as US x 83 in the seed, so its seed source shifts too - but only on a future version bump, never
   live.

## Verification (live)

- `PATCH` of all 5 rows returned 200; `GET /admin/vehicle-pricing?country=US` shows the new values.
- `POST /rides/estimate` (US, app-style with dropoff): at 30 km -> Go $43, Standard $60, Priority $69,
  Premium $83, Truck $125 (in/at the target bands); at 32-35 km they land mid-band. Tier spread now ~2.9x.
- GH unchanged (car GH35.17); NG and other markets untouched.
- Backend `tsc` clean; no em/en dashes.

## Deploy

- Live rates: applied immediately via the admin API (no deploy needed).
- Seed source: backend `develop` -> `main`. No app/admin build (the app reads live estimates).
