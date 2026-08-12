# Round 45 - Referral shows the user's currency (fix GHS shown for EUR / unsupported markets)

## Problem

The referral "Invite" screen showed "GH₵80.00" for a user in the Netherlands; it should show their currency
(EUR). The app was correct - `useCurrency()` resolves NL to EUR and calls `GET /referrals/me?currency=EUR`.
The bug was entirely in the backend.

`referral-service.rewardsForWalletOf` looked up the requested currency (EUR) in `platform_settings`, found no
EUR row (only US/GH/NG/KE/ZA/TZ/UG/CA/IN + a DEFAULT USD row are seeded), then fell through to the user's
WALLET currency (GHS by default) which matched the Ghana row (80.00) and returned `currency: "GHS"` - so the
app rendered GH₵80.00. The same fallback also mis-credited EUR-wallet users the Ghana amount.

## Fix (backend only) - `src/services/referral-service.ts`

`rewardsForWalletOf` now resolves the **target currency first**, then the **amounts**:

1. Target currency: explicit `preferCurrency` (the app's display currency) -> the user's wallet currency ->
   the `fallbackCountry`'s configured currency -> `"USD"`.
2. Amounts: the per-currency config row for THAT currency if one exists (GHS -> 80, USD -> 5, NGN -> 2000);
   otherwise the DEFAULT (then US) baseline (5 / 10). The returned `currency` is always the user's currency, so
   the amount and symbol match; it never borrows an unrelated market's currency.

Results: NL/EUR -> `€5.00 / €10.00`; GH -> `GH₵80.00 / 10.00` (unchanged); NGN -> `2000 / 10`; any other
unsupported currency (e.g. GBP) -> that currency with the DEFAULT baseline, never GHS. Credit paths (no
`preferCurrency`) get the same behavior, so a EUR-wallet user is credited the EUR baseline, not GH 80.

Admins can configure a specific per-currency amount later by adding that market's `platform_settings` row;
until then unsupported currencies use the DEFAULT baseline. No app or config change was required.

## Verification (live)

- Backend `tsc` clean; no em/en dashes.
- `GET /referrals/me?currency=EUR` -> `currency:"EUR"`, `referrerReward:5`, `refereeReward:10` (not GHS 80);
  `?currency=GHS` -> GHS 80/10; `?currency=NGN` -> NGN 2000/10; `?currency=GBP` -> GBP 5/10 baseline.

## Deploy

- Backend `develop` -> `main`. No app or config change.
