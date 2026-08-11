# Round 41 - referral reward shown in the user's Default Currency + admin per-currency config

Refinement of the referral display. Round 40 showed the reward in the user's wallet/local currency
("GH₵80.00"); the user wants it in their **Default Currency** (the app's currency selector). Model
(confirmed): **per-currency amounts** - admin configures a distinct referral amount per currency/country,
and each user sees the amount configured for THEIR default currency (no FX conversion).

## Slice A - Display in the user's default currency

**Backend**
- `services/referral-service.ts`: `rewardsForWalletOf(userId, fallbackCountry?, preferCurrency?)` now resolves
  the `platform_settings` row in priority order: (1) `preferCurrency` (the app's Default Currency) ->
  (2) wallet currency -> (3) `fallbackCountry` -> (4) US. Returns the resolved row's amounts + currency, so
  amount and symbol always agree. `getOrCreateCode(userId, displayCurrency?)` passes `displayCurrency`.
  The CREDIT paths (`applyAtSignup`, `rewardReferrerOnFirstCompletion`) are unchanged (still wallet-based) -
  real money lands in the wallet's currency; the display currency is a view concern.
- `controllers/ReferralController.ts`: reads `req.query.currency` (validated to a 3-letter code, uppercased)
  and passes it to `getOrCreateCode`.

**App**
- `repositories/referral-repository.ts`: `getMine(currencyCode?)` -> `GET /referrals/me?currency=CODE`.
- `app/invite/index.tsx`: passes `useCurrency().code` (the user's Default Currency) to `getMine`. `money()`
  formats with the returned currency's symbol (`getCurrencyByCode`), so a USD-default user sees "$5.00",
  a GHS-default user sees "GH₵80.00".

## Slice B - Admin: configure referral amounts for all currencies

Per-country amounts already exist in `platform_settings` for all 10 markets (CA, DEFAULT, GH, IN, KE, NG,
TZ, UG, US, ZA); `updateSettings` already persists any passed field (`Object.assign` + `req.body`
passthrough), so `PUT /admin/settings/:country` already saves both referral fields.
- Backend `admin-service.ts`: added `referralRefereeReward: number;` to the `updateSettings` data type
  (documentation/type-safety only).
- Admin `velo-admin/src/pages/FeeStructure.jsx`: the "Referral Program" section now has BOTH inputs -
  "Referrer Reward (CUR)" (`referralRewardAmount`) and "Referee Signup Bonus (CUR)" (`referralRefereeReward`).
  The per-country selector scopes which currency is edited, covering all markets. `form` spreads the full
  settings and `handleSave` sends the whole form, so no extra wiring.

## Verification

- `tsc` clean (backend + app); `velo-admin` `vite build` clean; no "—"/"–" in touched files.
- Live (after deploy): `GET /referrals/me?currency=USD` -> `currency:"USD"` + US amounts; `?currency=GHS` ->
  GHS 80/10; `?currency=NGN` -> NGN amounts; no param -> wallet/country fallback. Admin: update GH referral
  amounts via `PUT /admin/settings/GH`, confirm persisted, restore.

## Deploy

- Backend `develop` -> `main`; admin `main` (auto-deploys); app `master` + `eas build` (v1.1.6).
