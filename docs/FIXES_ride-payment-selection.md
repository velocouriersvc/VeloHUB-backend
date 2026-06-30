# Fix - Ride payment selection stuck on Cash, momo not selectable

## Reported issue
In the ride Summary, changing the payment method always showed "Cash" and Mobile
Money could not be selected.

## Root causes (two bugs, both app-side)
1. **Momo reset to cash.** In `PaymentSelection`, tapping Mobile Money ran
   `setPaymentMethod('momo')` and then called `onSelectCash()`, whose handler in
   `rides.tsx` did `setPaymentMethod('cash')`. So momo was immediately overwritten
   back to cash and could never stick.
2. **Summary hard-coded "Cash".** `RideSummary` always rendered the text
   "Payment via Cash" with a cash icon, ignoring the selected method.

Separately, the chosen method was **never sent to the backend** - `setPayment` was
not called anywhere in the app, so momo/card never actually charged via Paystack.

## Fixes
- `components/rides/PaymentSelection.tsx`: rewritten around one `onProceed(method)`
  callback. Each option (Mobile Money, Card, Cash) sets its own method and proceeds.
  Removed the dead Stripe-only Apple Pay and "Pay with Link" options. Card + Mobile
  Money are charged via Paystack; Cash is collected by the driver.
- `app/rides.tsx`: the payment step uses a single `onProceed` handler (sets the
  method, advances to the summary). The summary now receives `paymentMethod`.
- `components/rides/RideSummary.tsx`: shows the actual method (label + icon) via a
  small `PAYMENT_LABELS` map instead of hard-coded "Cash".
- `components/rides/VeloSendModal.tsx`: updated to the new `onProceed` prop.
- `app/rides.tsx`: once a driver **accepts**, the app now calls
  `RideRepository.setPayment(rideId, { phoneNumber, paymentMethod })` exactly once.
  The backend (`ride-service.setPaymentMethod`) requires status ACCEPTED, then:
  - cash -> marked PAID (driver collects on delivery),
  - momo/card -> Paystack charge; if an `authorizationUrl` is returned the app opens
    it (`Linking.openURL`) so the customer completes payment.
- `infrastructure/api/res-req/rides.res-req.ts`: `SetPaymentBody.paymentMethod` now
  includes `'card'` (backend `PaymentMethod` enum already supports momo/card/cash/wallet).

## End-to-end flow (after fix)
select momo -> summary shows "Payment via Mobile Money" -> confirm -> ride SEARCHING
-> driver accepts -> app calls setPayment -> Paystack momo prompt / card URL (or cash
marked PAID) -> webhook confirms -> ride proceeds.

Answer to the user's question: payment is **not** fixed on cash. Cash, Mobile Money,
and Card all work; momo/card are handled by Paystack.

Verification: app `tsc --noEmit` clean; no em dashes. Ships in the next EAS build.
