# Round 39 - Driver acceptance %, driver demand map, referral program, admin edit user

Four independent, end-to-end features across the backend (VeloHUB-backend), mobile app (VeloHUB),
and admin dashboard (velo-admin).

## Slice 1 - Admin: edit a user's phone number and country

**Backend**
- `admin-service.updateUser(userId, { phoneNumber?, country? })` - normalizes/validates the phone via
  `utils/phone-validator.validatePhoneNumber`, enforces the unique-phone constraint with a clear
  "already in use" error, uppercases the 2-letter country code, saves, and returns the updated fields.
- `AdminController.updateUser` + `PATCH /admin/users/:id` (adminRole). Records an `AuditLog`
  ("Update User Details", HIGH). Errors map to 404 (not found) / 400 (invalid | duplicate | empty).

**velo-admin** (`src/pages/Riders.jsx`, `src/api/base44Client.js`)
- `base44.entities.Users.update(id, data)` -> `PATCH /admin/users/:id`.
- A "Edit Details" row action opens a dialog with Phone + Country (2-letter code) inputs; on save it
  sends only the non-empty fields, then invalidates the `['riders']` query and toasts.

## Slice 2 - Real driver acceptance rate (no more fake 98%)

**Backend**
- `driver_profiles` gains `ridesOffered` + `ridesAccepted` (int, default 0; TypeORM synchronize adds
  them and Postgres backfills 0).
- `driver-match-service.broadcastRideRequest` increments `ridesOffered` for every driver a
  ride/delivery is broadcast to (the single broadcast path for both rides and deliveries).
- `ride-service.acceptRide` and `delivery-service.acceptDelivery` increment `ridesAccepted` for the
  accepting driver.
- `ride-service.getDriverPublicStats` returns
  `acceptanceRate = ridesOffered > 0 ? min(100, round(ridesAccepted / ridesOffered * 100)) : null`
  (null = no offers yet). `DriverController.getStats` passes it through.

**App** (`app/(driver-tabs)/dashboard.tsx`)
- Default + fallback is `'New'` (not 98). When the API returns null the card shows **New**; otherwise
  it shows `NN%`.

## Slice 3 - Driver demand map (category-colored shop pins)

**Backend**
- `merchant-service.getNearbyMerchants(lat, lng, radiusKm=20)` - approved merchants with coordinates
  within the radius (Haversine in SQL, capped at 100), returning
  `{ id, businessName, category, latitude, longitude }`.
- `DriverController.getNearbyMerchants` + `GET /driver/nearby-merchants?lat=&lng=&radius=` (driverRole).

**App** (`repositories/driver-repository.ts`, `app/(driver-tabs)/dashboard.tsx`)
- `DriverRepository.getNearbyMerchants(...)`; the driver map renders colored `Marker`s bucketed by
  category (food, pharmacy, grocery, marketplace, services), refreshed when the driver moves
  (rounded to 2 decimals to avoid churn). Hides gracefully when there are none.

## Slice 4 - Referral program

**Amounts** (`platform_settings`, per country, local currency)
- `referralRewardAmount` = referrer reward (already seeded per country).
- `referralRefereeReward` = referee reward (new column, default 10; backfilled for existing rows).

**Backend** (`services/referral-service.ts`)
- `getOrCreateCode(userId)` - creates a unique 6-char code on first use; returns
  `{ code, referrerReward, refereeReward, currency, invited, completed, earned }`.
- `applyAtSignup(newUserId, code, country)` - for a brand-new user only: validates the code (exists,
  not self, no existing link), creates a PENDING `ReferralLink` (rewardAmount = referrer reward), and
  credits the referee the referee reward to their wallet. Non-fatal on any error.
- `rewardReferrerOnFirstCompletion(referredUserId)` - on the referee's FIRST completed ride or order,
  flips the PENDING link to COMPLETED and credits the referrer. Idempotent (only PENDING is paid).
- Wiring: `auth-service.verifyOtp` + `registerWithPassword` accept an optional `referralCode` and call
  `applyAtSignup` only when a brand-new user is created; `ride-service.completeRide` and
  `delivery-service.completeDelivery` call `rewardReferrerOnFirstCompletion(customerId)`.
- `GET /referrals/me` (`referralRoutes`, buyer/driver) -> `getOrCreateCode`.

**App**
- `app/(auth)/register.tsx` gains an optional "Referral code" field, passed through
  `AuthRepository.register`.
- `app/invite/index.tsx` (new) - the Invite/Earn screen: real code, copy-to-clipboard, the exact
  program copy parametrized to the real amounts + currency, invited/earned progress, and native
  Share. `app/offers/index.tsx` footer now links here ("Invite Friends").
- `repositories/referral-repository.ts` - `GET /referrals/me`.

## Verification

- `tsc --noEmit` clean: VeloHUB-backend, VeloHUB. `velo-admin` `vite build` succeeds.
- No em dash (U+2014) or en dash (U+2013) in any touched file (the referral copy uses "-").
- Post-deploy live probes (production, after `develop` -> `main`): `GET /driver/nearby-merchants`,
  a throwaway signup with a valid code crediting the referee, first ride/order crediting the referrer,
  `PATCH /admin/users/:id` updating phone + country (and rejecting a duplicate phone), and
  `GET /driver/stats` returning a real `acceptanceRate` (or null -> "New").

## Deploy

- Backend: `develop` -> `main` (production CI `docker-publish.yml`).
- App: `master` + a full `eas build` (no OTA).
- Admin: `main`.
