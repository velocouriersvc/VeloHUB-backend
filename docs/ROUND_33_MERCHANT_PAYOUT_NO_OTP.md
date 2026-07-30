# Round 33 - remove the OTP step from merchant Instant Payout

Date: 2026-07-30

## Problem
A merchant could not complete an Instant Payout because the 6-digit confirmation code never
arrived. Investigation:
- The code is NOT Paystack's transfer approval (the dashboard "Approval URL" / "Confirm transfers"
  setting). This backend never uses Paystack's transfer OTP.
- The 6 digits are our own Prelude SMS OTP: the app calls `POST /payouts/otp`
  (`PayoutController.sendOtp` -> `OtpService.createOtp` -> `PreludeService.sendVerification`), and
  `POST /payouts/instant` required it. This OTP was enforced for merchants only; drivers never had it.
- Live logs show Prelude ACCEPTS every send ("Verification sent successfully", sender `VeloHUB`), so
  the backend was not erroring; the SMS simply was not delivered to the merchant's number (it was
  going to a MoMo number that does not receive it, and the user confirmed no codes arrive there).
  Login and payout OTP share the identical send path, so this is a delivery problem, not a code bug.

## Fix
Removed the OTP requirement from merchant Instant Payout so it behaves exactly like driver payout.
- `src/controllers/PayoutController.ts` `instant`: merchant branch keeps the business-owner role
  check (403 otherwise) but no longer requires/verifies an OTP. Payouts stay protected by the
  pre-verified bank/recipient (`saveBankDetails`), the minimum-balance check, and the role check.
- `POST /payouts/otp` (`sendOtp`) and its route are kept so older installed app builds that still
  call it get a 200 instead of a 404.
- App `components/payouts/PayoutSheet.tsx`: merchants skip the OTP entry screen and pay out directly;
  the primary button is "Pay Out Now" for both roles. The OTP screen + state were removed.

## Verified (E2E, production)
- Backend + app `tsc` clean; no em dashes on touched files. Deployed develop -> main.
- Safe live probe (no money moved): as a merchant with a saved bank + balance 95.31 GHS, a payout of
  100000 (over balance) with NO otp returned "Insufficient wallet balance for this payout" (previously
  it returned "OTP_REQUIRED"), proving the OTP gate is gone. Wallet balance unchanged afterward.
- Ship: backend live on production; app -> master, needs a fresh `eas build` (version stays 1.1.4) so
  merchants no longer see the OTP screen.
