# Round 34 - Mobile Money as a first-class payout option (drivers + merchants)

Date: 2026-07-31 (the "100th update")

## Problem
Drivers reported they could only withdraw to a Bank, not Mobile Money, while merchants could do both.

## Root cause (UX, not a missing capability)
Both the driver screen (`app/(driver-tabs)/request-payout.tsx`) and the merchant screen
(`app/(seller-tabs)/request-payout.tsx`) use the SAME `components/payouts/PayoutSheet.tsx` for
withdrawals (their old role-specific momo modals were dead code, never wired to a button). The
PayoutSheet "add account" step listed everything from `GET /payouts/banks` in one "Select your bank"
list. That list already includes MoMo providers (Paystack returns MTN/Vodafone/AirtelTigo as
`type: "mobile_money"`), but they were buried and unlabeled, so drivers never found them. The backend
momo path already worked for drivers (`driver_profiles` has the same bank columns as
`merchant_profiles`, and `saveBankDetails`/`instantPayout` are role-symmetric).

## Fix (app only, no backend change)
- `components/payouts/PayoutSheet.tsx`: split the loaded list into `mobile_money` vs bank and add a
  clear "Mobile Money | Bank" segmented toggle (shown only when both exist; hidden for currencies with
  no momo such as NGN). Defaults to Mobile Money when the currency has momo (Ghana). Type-aware copy
  ("Select your mobile money provider" / "Mobile money number"). Reuses the existing verify/save/fee/
  withdraw logic (it already sets `isMomo` from the selected item's `type`).
- `app/(driver-tabs)/request-payout.tsx`: removed the orphaned MoMo/success modals and their dead
  state/handler; the "Withdraw Funds" button already opens the shared PayoutSheet.

## Verified (E2E, production)
- App `tsc` clean; no em dashes on touched files.
- `GET /api/v1/payouts/banks?currency=GHS` returns 3 `mobile_money` providers (MTN=MTN, Vodafone=VOD,
  AirtelTigo=ATL) plus 31 banks.
- Safe driver-momo save E2E (throwaway driver, real resolvable MTN number, no transfer): `POST
  /payouts/bank` with `role=driver` resolved the account name, saved `driver_profiles.bankCode=MTN`
  with `bankVerified=true`, and created the Paystack transfer recipient. Throwaway rows removed. This
  is the same path a merchant momo destination already uses in production.
- Ship: app -> `master` (fresh `eas build`, version stays 1.1.4). No backend deploy.
