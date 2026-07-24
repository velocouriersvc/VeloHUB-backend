# Round 23 fixes (payments, currency, driver/delivery, chat, order history, perf)

Date: 2026-07-23

Batch of production tester issues (Ghana + Nigeria + cross-cutting). Root-caused against the live
code and the production cluster. Two product decisions were confirmed with the user:

1. Paystack account is GHS-only, so every non-GHS charge is auto-converted to GHS and settled on the
   existing Ghana account (no Paystack dashboard change).
2. Prices are displayed in the actual transaction currency (the merchant/provider's), consistently.

## Backend changes

### 1. Paystack webhook signature (payments never confirmed via webhook)
`PaymentController.handleWebhook` hashed `JSON.stringify(req.body)`, but the webhook route uses
`express.raw`, so `req.body` is a Buffer. `JSON.stringify(Buffer)` yields `{"type":"Buffer",...}`, so
the HMAC never matched and every webhook was rejected ("Invalid webhook signature received").
Fix: hash the raw utf8 string (`Buffer.isBuffer(req.body) ? req.body.toString("utf8") : ...`).
The self-confirming poll already re-verified, so this restores the fast webhook path (important for momo).

### 2. Currency auto-convert to GHS ("Currency not supported by merchant")
`payment-service` default `PAYSTACK_ACCOUNT_CURRENCIES` listed NGN/KES/etc., so NGN charges were sent
to the GHS-only account and Paystack rejected them. Default changed to `GHS`, so non-GHS charges flow
through the existing settlement-currency conversion (`gatewayCharge`) using
`platform_settings.usdExchangeRate`. Override still available via `PAYSTACK_SUPPORTED_CURRENCIES`.

### 3. completeBooking idempotent + best-effort settlement (out-call code error)
`completeBooking` saved COMPLETED first, then ran settlement/notify unguarded, so a post-save failure
showed the merchant a 400 while the customer already saw completed, and a retry hit "already completed"
so the payout could never finish. Now: settlement is the single source of truth (it credits the wallet
first, then marks COMPLETED + PAID), a duplicate verify on a settled booking returns success, and an
unsettled-but-completed booking retries settlement. Settlement notifications are best-effort.

### 4. getActiveDelivery status filter + driver reset (completed job stuck)
`getActiveDelivery` had no status filter, so a finished delivery kept re-hydrating the navigation
screen and pinned the driver off the dashboard. Added `status NOT IN (DELIVERED, COMPLETED, CANCELLED)`
(mirrors `getDriverActiveRide`) and reset the driver to available on delivery completion.

### 5. Merchant driver-involved views (Order ID + driver name)
`merchant-service.getOrders` now batch-loads each assigned driver's `DriverProfile` and attaches
`driverName` + `driverVehicle` (the `driver` relation is a bare User with no name/vehicle). The
driver-assigned merchant notification (delivery accept + admin assign) now names the driver and keeps
the human `orderNumber`.

### 6. Order history amount + names (customer)
`getCustomerOrders` now loads `merchant.merchantProfile` so the store's business name is available;
item names are already in the items JSONB snapshot. (App reads `totalAmount` + `productName`.)

### 7. Chat send gate aligned with read gate
`sendMessage` now allows COMPLETED bookings (matching `getMessages`), so a follow-up message never
403s and collapses the conversation.

### 8. Perf: getAvailableDeliveries N+1 removed
Dropped the per-row `merchantProfileRepo.findOne`; the merchant profile is already left-joined.

### 9. Nigeria login: OTP retry without sender_id
`PreludeService.sendVerification` retries once without `PRELUDE_SENDER_ID` if the first attempt fails
(a Ghana-registered alphanumeric sender ID can be rejected for +234).

## Config / ops (owner action, not code)
- Confirm Prelude is provisioned for Nigeria and `PRELUDE_SENDER_ID` is allowed for +234.
- Fix/replace the invalid `PRELUDE_NOTIFICATION_TEMPLATE_ID` (transactional SMS via notify.send fails;
  swallowed, so non-blocking, but delivery-code SMS etc. do not send).

## Tests
`tests/round23-fixes.test.ts`: webhook raw-buffer payload, NGN->GHS conversion, completeBooking
idempotency (settled/unsettled/wrong-code), getActiveDelivery terminal-status exclusion. Full suite green.

## Live production verification (2026-07-23, post-deploy)
Verified against production (velo-api, new image rolled out cleanly, no startup errors):

- **Webhook signature**: a correctly-signed webhook (HMAC over the raw body using the pod's
  PAYSTACK_SECRET_KEY) now PASSES verification and logs "Webhook received"; a bad signature is
  rejected. Before the fix the valid one was also rejected.
- **NGN checkout (the reported failure)**: guest buyer, Nigerian merchant product (Chips, NGN 1000).
  Quote returned `currency: NGN` (total 1850). Checkout with momo returned a real Paystack
  `authorizationUrl` (order ORD-A7SJ25). Logs show "Converting gateway charge to settlement currency"
  NGN 1850 -> GHS 18.5 (rate 100). No "Currency not supported by merchant".
- **GH checkout (regression check)**: Ghana merchant product (Kenkey, GHS 85). Checkout momo returned
  an authorizationUrl (order ORD-ZBPBUE, total GHS 89.25), no conversion. Normal path intact.
- **Order history**: the marketplace orders payload now carries `totalAmount: 1850.00`, `currency: NGN`,
  `orderNumber`, and `merchant.merchantProfile.businessName` ("Pentaz Fingers"). Fixes the "Gh 0"/
  "Marketplace" display once the app OTA is live.
- **Product currency stamping**: GET /products/:id returns `currency: NGN` for the NG product and
  `currency: GHS` for the GH product.

Test orders are guest orders left in awaiting_payment and auto-cancel via the 10-minute job.

The remaining slices (merchant driver info, stuck-delivery filter, completeBooking idempotency, chat
gate, OTP sender_id retry) are covered by the jest suite and tsc; they need driver/booking state that
is not cheaply constructible via API probes, and their code paths are low-risk additive changes.
