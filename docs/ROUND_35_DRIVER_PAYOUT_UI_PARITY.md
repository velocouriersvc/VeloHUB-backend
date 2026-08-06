# Round 35 - Driver payout screen matches the Merchant one exactly

Date: 2026-07-31

## Request
Make the Driver "Request Payout" screen look and behave exactly like the Merchant screen
(`app/(seller-tabs)/request-payout.tsx`): "Cancel / Withdraw" header, "Enter Amount" card with
"Available to withdraw", a "SELECT METHOD" section (Paystack "Local Bank / Mobile Money" + Stripe), the
"Secured by SSL. Approval usually takes 15 - 30 minutes." line, the "Payout Schedule" banner, and a
bottom "Instant Payout" button that opens the shared `PayoutSheet`.

## Change (app only, single file)
Rewrote `app/(driver-tabs)/request-payout.tsx` to mirror the merchant screen, adapting only:
- `useCurrency('driver')`.
- Balance from `DriverRepository.getWallet()` -> `wallet.balance` (auth phone header is automatic).
- `<PayoutSheet role="driver" ... />`; onSuccess closes the sheet and refetches the balance.

Everything visible is identical to the merchant screen (header, amount card + tap-to-fill max +
"Insufficient balance." warning, Paystack/Stripe method cards, SSL info line, Payout Schedule banner,
"Instant Payout" button). The old blurred balance card + recent-requests list were replaced to match
the reference. The merchant's dead `handleRequest`/success/`MerchantRepository` path was intentionally
not copied (it is never reached; the button opens `PayoutSheet`).

## Verified
- App `tsc` clean; no em dashes on the touched file.
- The driver withdrawal itself (bank + Mobile Money via `PayoutSheet role="driver"`) was already
  verified E2E in production in Round 34 (driver momo destination resolved + Paystack recipient
  created, no transfer). This round only changes the surrounding screen layout.
- Ship: app -> `master` (fresh `eas build`, version stays 1.1.4). No backend deploy.
