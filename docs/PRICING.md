# Velo Dynamic Pricing Architecture

Last updated: 2026-06-19

This document describes how fares and fees are calculated across every Velo
vertical (rides, food delivery, package delivery, marketplace) and where to
change each value.

## TL;DR

```
Subtotal      = (Base + PerKm*Distance + PerMin*Time) * VerticalWeights
Surged        = Subtotal * Surge            (Surge capped at 1.4x)
Service Fee   = Surged * 5%                  (100% to platform; fixed even at peak)
Rider Pays    = Surged * 1.05               (then floored at the minimum fare)
Driver Gets   = Surged * 85%
Platform Gets = Service Fee + (Surged * 15%)
```

Identity that always holds: `Rider Pays (pre-discount) = Driver Gets + Platform Gets`.

## Where things live

| Concern | Source of truth | File |
| --- | --- | --- |
| The fare ALGORITHM (one place) | code | `src/config/pricing.ts` |
| Per-country ride rates (base/km/min/min-fare) | DB `vehicle_pricing` | seed: `src/scripts/seed-vehicle-pricing.ts` |
| Fee rates, surge cap, delivery base/km | DB `platform_settings` | seed: `src/scripts/seed-platform-settings.ts` |
| Cross-vertical multipliers | code | `src/config/pricing.ts` -> `VERTICAL_PROFILES` |
| Ride fare entrypoint | code | `src/services/fare-service.ts` |
| Order delivery fee entrypoint | code | `src/services/delivery-fee-service.ts` |
| Prod data update | migration | `src/migrations/1750100000000-DynamicFareArchitecture.ts` |
| Spec assertions | test | `tests/pricing.test.ts` |

All math is funnelled through the pure functions `computeRideFare` and
`computeDeliveryFee` so it is computed in exactly one place and unit-tested.

## Country baselines (standard / car tier)

| Country | Base | Per Km | Per Min | Service Fee | Driver Keeps | Surge Cap |
| --- | --- | --- | --- | --- | --- | --- |
| Ghana (GHS) | 6.00 | 2.20 | 0.40 | 5% | 85% | 1.4x |
| Nigeria (NGN) | 400 | 110 | 20 | 5% | 85% | 1.4x |

Tiers scale off the standard (car) tier: **bike 0.75x, car 1.0x, suv 1.5x, truck 2.5x**.

### Worked examples (validated by `tests/pricing.test.ts`)

Ghana, 8 km / 15 min standard ride:
```
Subtotal = 6.00 + (8 * 2.20) + (15 * 0.40) = 29.60
Rider    = 29.60 * 1.05 = 31.08
Driver   = 29.60 * 0.85 = 25.16
Platform = 1.48 (fee) + 4.44 (15%) = 5.92
```

Nigeria, 10 km / 20 min standard ride:
```
Subtotal = 400 + (10 * 110) + (20 * 20) = 1,900
Rider    = 1,900 * 1.05 = 1,995
Driver   = 1,900 * 0.85 = 1,615
Platform = 95 (fee) + 285 (15%) = 380
```

## Cross-vertical pricing

`VERTICAL_PROFILES` in `src/config/pricing.ts`:

| Vertical | Base | Per Km | Per Min | Logic |
| --- | --- | --- | --- | --- |
| Rides | 1.0x | 1.0x | 1.0x | Competes with Bolt/Yango economy. |
| Food | 0.8x | 1.2x | 1.0x | Cheap entry, heavy km; monetize via merchant commission. |
| Package | 1.2x | 1.0x | 1.0x | Higher base for loading/unloading labor. |
| Marketplace | 0.7x | 1.0x | 0.0x | Distance only; pooled routing stacks orders. |

- **Rides**: `RideType.RIDE` -> RIDES profile (in `ride-service`).
- **Package**: `RideType.DELIVERY` -> PACKAGE profile (in `ride-service`).
- **Food vs Marketplace**: resolved from the merchant `category` via
  `resolveOrderVertical()` inside `delivery-fee-service`. Food categories are
  listed in `FOOD_CATEGORIES`; everything else is marketplace.

## Surge protection

- Hard cap **1.4x** (`MAX_SURGE_MULTIPLIER`, mirrored in every
  `platform_settings.maxSurgeMultiplier`). Competitors hit 3.0x; we never do.
- Surge applies to the trip subtotal only. The **5% service fee stays 5%** even
  during a surge (it is computed from the already-surged subtotal, so it never
  becomes a separate peak penalty).
- Time-of-day rules live in `surge_rules`; `FareService.getSurgeMultiplier`
  resolves the active multiplier and `computeRideFare` clamps it to the cap.

## How to change pricing

1. **A rate for a country** (e.g. Ghana per-km): edit
   `seed-vehicle-pricing.ts` (fresh envs) AND add a small data migration to
   `UPDATE vehicle_pricing` for the live DB. Re-run `npm run seed:pricing` or
   let migrations run on deploy.
2. **Fee %, surge cap, delivery base/km**: edit `seed-platform-settings.ts` +
   migration `UPDATE platform_settings`.
3. **Vertical weighting**: edit `VERTICAL_PROFILES` in `src/config/pricing.ts`
   and update `tests/pricing.test.ts`.

After any change: `npx jest tests/pricing.test.ts` must stay green.

## Deploying the June 2026 update

The migration `1750100000000-DynamicFareArchitecture` updates the live DB
(GH/NG baselines, NG service fee 4% -> 5%, surge caps -> 1.4x). It runs
automatically wherever TypeORM migrations run on deploy. For environments using
`DB_SYNCHRONIZE`, also run `npm run seed:pricing` (and the platform-settings
seed) to re-apply the seed values.
