# Round 26 - On-Demand Payouts (automated) + ride/delivery chat + package iOS

Date: 2026-07-27

## Bugs fixed
1. **Ride/delivery chat showed "No messages yet"** for marketplace order deliveries. The chat is
   keyed by a job id; for order deliveries that id is an ORDER id, but `RideMessageService` only
   looked up rides. It now resolves the context from a ride OR an order (`ride-message-service.ts`,
   `socket-gateway.deliverRideMessage` also emits to the order room). The customer order-tracking
   screen's dead chat button is now wired to a chat modal.
2. **Package checkout stuck on iOS** ("Secure payment" spinner). `payment-webview` now waits for the
   screen transition (InteractionManager + short delay) before presenting SFSafari on iOS, so the
   package flow (which pushes the webview) no longer fails to present.

## On-Demand Payouts (Option 2: fully automated, no admin approval)
- **Bank details**: `paystack-provider.listBanks` + `resolveAccount`; structured bank fields on
  driver + merchant profiles; `POST /payouts/bank` resolves the account (fraud check), creates a
  Paystack transfer recipient, and stores it (recipient code cached on the wallet).
- **Fee transparency**: `payout-fee.ts` computes the transfer fee + gross/fee/net; `POST /payouts/quote`
  and the app show "Request X / Fee Y / Receive Z". Wallet debit = gross; net = gross - fee.
- **Instant payout** (`POST /payouts/instant`): fires the Paystack transfer immediately. Guards -
  driver: min balance, max 3/day, no active ride/delivery; merchant: merchant role + OTP; both:
  balance must cover the gross. Ledger row itemizes the fee + audit (role, userId, ip, timestamp).
  A synchronous rejection re-credits the wallet before erroring.
- **Reversal webhooks**: `transfer.success` -> completed; `transfer.failed`/`transfer.reversed` ->
  re-credit the full gross to the wallet (idempotent) + notify the user.
- **App**: `PayoutSheet` (bank add/verify, amount + fee breakdown, merchant OTP) opened from the
  driver + merchant payout screens.
- **Admin (velo-admin)**: a read-only `/payouts` page listing every payout with gross/fee/net/status
  (processing/completed/reversed) + destination, for monitoring (Option 2, no approval).

## OWNER ACTIONS REQUIRED before payouts work in production
1. **Enable Paystack Transfers** on the account, and **disable the Transfers OTP** in the Paystack
   dashboard (Settings -> Preferences). Automated (Option 2) transfers cannot complete if Paystack
   still requires a per-transfer OTP - they would sit in an `otp` state. (Our OTP is the merchant
   in-app confirmation, separate from Paystack's transfer OTP.)
2. Ensure the Paystack account is funded / has a transfer balance, and `transfer.*` webhook events
   reach `POST /api/v1/payments/webhook`.
3. Deploy: merge backend `develop` -> `main` (CI). Fresh app build (keep version 1.1.4; EAS
   auto-increments the iOS build number - no Apple review needed for a JS-only change... note this
   round has NEW native nothing, so OTA-less full build still required since there is no OTA). Deploy
   velo-admin.

## Verification
Backend `tsc` + jest (138, incl. payout-fee tiers/breakdown) green; app `tsc` green; no em dashes.
Live E2E after deploy + Paystack transfers enabled: save a bank (resolve + recipient), request a
payout (fee shown, wallet debited gross, transfer fires), and a signed `transfer.failed` webhook
re-credits the wallet.
