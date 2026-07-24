# Round 24 findings - the 4 "remaining" issues are fixed in code; delivered by the next app build

Date: 2026-07-24

The tester reported 4 remaining issues after the Round 23 deploy. A read-only investigation plus
live production probes established that all four are ALREADY fixed in committed code and verified
against the live backend. The reason they still appear broken on the tester's device is that this
app has NO over-the-air updates (`expo-updates` is not installed), so app-side fixes only ship in a
full rebuild, and the tester is on a build that predates Round 22/23. The user chose to keep full
builds, so a fresh production build delivers issues 2, 3, and 4; issue 1 (package) is also fixed in
the current code (backend proven correct below).

## Live verification (production)

1. **Package "Send Packages" checkout (issue 1)** - the backend is correct. A live `package_ride`
   checkout returned a valid Paystack URL and a pollable reference:
   - `authorizationUrl: https://checkout.paystack.com/...` (top level AND on `ride`)
   - `paymentReference: RIDE-...` and `GET /payments/status/:ref` resolves it (`pending/abandoned`).
   The app passes these correctly into the same WebBrowser payment sheet the working food/services
   checkouts use (`app/payment-webview.tsx`, introduced in commit 277c76f, present since R22). The
   tester's stuck sheet is the pre-R22/R23 build. Hardened the package flow to read the gateway
   fields from the authoritative top-level checkout response (`app/rides.tsx`).

2. **Order History amount (issue 3)** - backend returns the full order: re-verified live
   `totalAmount: 1850.00`, `currency: NGN`, `merchant.merchantProfile.businessName: "Pentaz Fingers"`.
   `app/orders/history.tsx` (R23) reads `order.totalAmount` + `order.currency` + the merchant name +
   `item.productName`. The screenshots show the exact PRE-R23 fallback ("Marketplace / Items / GH0"),
   confirming an old build.

3. **Services chat (issue 4)** - backend `getMessages` returns all messages for BOTH participants on a
   real completed booking (verified live: 4 messages returned to customer and merchant); messages
   persist with the correct `bookingId` + `senderRole`. `app/chat/[id].tsx` (R23) renders on a
   successful load and no longer collapses on a transient poll failure.

4. **Booking ID + driver name to merchant (issue 2)** - the deployed backend names the driver and
   includes the human order number in the merchant "Driver Assigned" notification
   (`delivery-service.ts`, `admin-service.ts`); `merchant-service.getOrders` attaches
   `driverName` + `driverVehicle`; `app/(seller-tabs)/order-details.tsx` (R23) renders them.

## Changes this round (app only; no backend change needed)

- `app/(tabs)/profile.tsx`: show `Velo v<version>` so a tester can confirm they are on the fix build.
- `app.json`: bump `version` 1.1.2 -> 1.1.3 and Android `versionCode` 16 -> 17.
- `app/rides.tsx`: read package gateway fields from the authoritative top-level checkout response.

## Action required

Do a fresh production build from `master` (contains R22 + R23 + this round) and install/submit it.
Confirm the profile screen shows **v1.1.3**, then re-test: package momo + card, Order History amount,
services chat in-window for both sides, and the merchant seeing the order ID + driver's name.
