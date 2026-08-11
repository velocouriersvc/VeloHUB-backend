# Round 40 - referral currency fix, admin edit hardening, admin online counts

Follow-up fixes after Round 39, across backend (VeloHUB-backend), app (VeloHUB), admin (velo-admin).

## Issue 1 - Referral reward showed a mismatched currency ("GHS 5.00")

**Cause:** `referral-service.getOrCreateCode` sourced the reward **amount** from `platform_settings`
keyed on `user.country` (which resolved to the US/DEFAULT row = 5) but the **currency** from
`wallet.currency` (GHS). The two were never reconciled.

**Fix (user decision: show the local wallet currency):**
- Backend `src/services/referral-service.ts`: new `rewardsForWalletOf(userId, fallbackCountry?)` resolves
  the `platform_settings` row by the user's **wallet currency** (fallback country, then US), so the amount
  and currency come from one market - the money's real destination.
  - `getOrCreateCode` returns `referrerReward` / `refereeReward` / `currency` all from that one row.
  - `applyAtSignup` prices the referrer's stored payout from the referrer's market and the referee's signup
    credit from the referee's market, so each party is rewarded in their own wallet currency.
- App `app/invite/index.tsx`: `money()` now formats with the currency **symbol** via `getCurrencyByCode`
  (`utils/currency.ts`), e.g. "GH₵80.00" instead of "GHS 80.00".

Result: a Ghana-wallet user sees GH₵ 80.00 / GH₵ 10.00 (the real GH amounts), not GHS 5.00.

## Issue 2a - Admin "Edit Details" returned "User not found"

The edit endpoint is correct: a live probe (guest admin `+233000000000`) confirmed
`PATCH /admin/users/:id` with a valid `User.id` + `{country}` returns 200. The 404 came from editing a
**stale row** (a user that no longer existed), which is easy to hit after test users are deleted.

**Fixes:**
- Admin `velo-admin/src/pages/Riders.jsx`: `saveEdit` sends only fields the admin actually changed (no
  re-sending the unchanged local-format phone); on a 404 it refreshes the list and shows "This user no
  longer exists. The list has been refreshed." instead of a confusing error.
- Backend `admin-service.updateUser`: distinct "No user exists with that id" message (vs the auth
  middleware's "User not found"); passes the target/existing country as a region hint to
  `validatePhoneNumber` so local-format numbers ("0248...") normalize to E.164.

## Issue 2b - Admin dashboard: live Merchants online + Drivers online

- Merchant online = `MerchantProfile.isOpen === true` (+ APPROVED) - already computed by `getDashboard`
  as `overview.activeMerchants`; now rendered.
- Driver online = Redis `driver:status:{id} === "online"` (the matcher's own source, so it matches the app).
  - Backend `redis-location-service.ts`: `countOnlineDrivers()` scans `driver:status:*` and counts `online`.
  - Backend `admin-service.getDashboard`: new `overview.driversOnline` (+ `AdminDashboard` interface field).
  - Admin `velo-admin/src/pages/Dashboard.jsx`: two live stat cards ("Drivers Online", "Merchants Online").

## Verification

- `tsc --noEmit` clean (backend + app); `velo-admin` `vite build` clean; no "—"/"–" in touched files.
- Live (post-deploy): referral `/referrals/me` returns consistent local-currency amounts; guest-admin
  `PATCH /admin/users/:id` updates country/phone (200) and rejects duplicates; `/admin/dashboard` returns
  numeric `overview.driversOnline` + `overview.activeMerchants`.

## Deploy

- Backend `develop` -> `main` (prod). Admin `main` (auto-deploys). App `master` + `eas build` (v1.1.6).
