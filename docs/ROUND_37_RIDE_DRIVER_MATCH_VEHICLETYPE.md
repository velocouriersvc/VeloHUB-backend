# Round 37 - fix ride driver-matching (free-text vehicleType vs enum)

Date: 2026-08-06

## Problems (two reports, one root cause)
1. "Choose Your Velo" ride-type cards always show "No drivers" even when a driver is online, while the
   "Available Near You / Request a Ride" card works.
2. "It doesn't work when you click" a ride type - the request never reaches a driver.

## Root cause
Drivers pick a free-text vehicle type at onboarding: `VEHICLE_TYPES = ['Car','Motorcycle','Bicycle',
'Van','Truck','Tricycle']` (`VeloHUB/data/auth-data.ts`), stored verbatim in
`driver_profiles.vehicleType` (varchar). But `DriverMatchService.searchInRadius`
(`src/services/driver-match-service.ts`) keeps a Redis-nearby driver only if
`VEHICLE_COMPATIBILITY[requestedTier].includes(profile.vehicleType)`, and `VEHICLE_COMPATIBILITY` uses
the backend enum (`bike/car/priority/suv/truck`). `"Car" !== "car"`, so EVERY online driver was filtered
out of EVERY tier:
- `RideService.getFareEstimate` -> `findDrivers(...).length` = 0 for all tiers -> every card shows
  `availableDrivers: 0` -> "No drivers" (issue 1);
- the real match (`requestRide` -> same `findDrivers`) returned 0, so a request never reached a driver
  (issue 2).
The "Available Near You" card was unaffected: it calls `RedisLocationService.findNearbyDrivers` directly
with no vehicle-type filter. The "Velo Basic" (GH) vs "Velo Standard" (US) label is the intended
per-country display name (confirmed live: GH estimate returns `displayName: "Velo Basic"`), not a bug.

## Fix (backend only, one place)
Added `normalizeVehicleType()` in `driver-match-service.ts` and applied it in `searchInRadius` before the
compatibility check (and as the matched driver's returned type). It maps the onboarding vocabulary +
synonyms to the enum, case-insensitively: motorcycle/bicycle/tricycle/scooter/moto/okada -> bike;
car/sedan/hatchback/saloon/taxi -> car; suv/van/minivan/jeep/crossover/wagon -> suv;
truck/pickup/lorry/trailer -> truck; existing enum values pass through; unknown -> car. Now a "Car"
driver serves Velo Standard + Velo Priority, "Motorcycle" -> Velo Go, "Van" -> Velo Premium, "Truck" ->
Velo Truck. This single matcher is shared by fare estimates AND real dispatch, so both issues are fixed
with no data migration and no app change (the app already renders the closest-driver ETA when
`availableDrivers > 0`).

## Verified
- Unit test `tests/driver-vehicle-normalize.test.ts` (4/4 pass) reproduces the exact production failure:
  a "Car" driver is compatible with CAR and PRIORITY requests and not BIKE/SUV/TRUCK; "Motorcycle" ->
  BIKE; "Van" -> SUV; "Truck" -> TRUCK; unknown -> CAR. This is the definitive proof of the fix.
- Backend `tsc` clean; no em dashes on touched files. Shipped develop -> main (production).
- Live: `POST /rides/estimate` is healthy post-deploy and returns all 5 tiers with `availableDrivers` +
  `estimatedPickupMin`. A live "online driver becomes visible" flip could not be shown this session
  because no driver was online anywhere (confirmed via `/rides/nearby-drivers` at all hubs) and Redis
  injection needs cluster access; the deterministic unit test covers the logic. To confirm in the app:
  bring a driver online and open "Choose Your Velo" - the driver's compatible tiers now show the ETA
  and a request matches.
