# Round 27 - package iOS checkout, in-app chat layout, payout screen (app-side fixes)

Date: 2026-07-27

All three were app-side rendering/navigation bugs; the backend (deployed from develop) is correct
(chat message endpoints + /payouts endpoints re-verified live: 34 banks, message history returns).

## 1. Package Paystack payment stuck on iOS
First attempt (`router.replace` instead of `router.push`) did NOT fix it on the built app, so the
cause is not navigation. Real cause: the in-app SFSafari browser (`WebBrowser.openBrowserAsync`,
PAGE_SHEET) repeatedly failed to present on iOS, and the R26 `InteractionManager.runAfterInteractions`
delay made it worse (it can wait forever behind the rides/map animations, so the browser was never
even opened - permanent spinner). Fix (`app/payment-webview.tsx`): on iOS, open Paystack via
`Linking.openURL` (the SYSTEM browser, which always presents); the existing status poll + the server
webhook confirm the payment when the user returns. Android keeps the in-app browser (reliable there),
with a `Linking` fallback. `router.replace` is retained for the package flow (harmless, matches the
other checkouts).

## 2. In-app service chat showed an empty window (composer stuck at top)
`app/chat/[id].tsx` had the message `FlatList` INSIDE a `KeyboardAvoidingView` with `behavior="height"`
(Android), which collapses the list to ~0 height. Fix: moved the list OUT of the KAV so it fills the
flex column, and wrapped ONLY the composer in the KAV (`behavior={undefined}` on Android, `padding` on
iOS) - matching the working `DriverChatModal`. Also added a 5s REST poll to the socket-based ride/
delivery chat (`navigation.tsx`, `rides.tsx`, `orders/track.tsx`) so messages show even when the
socket does not deliver.

## 3. Payout sheet rendered broken on iOS (grey boxes, no text)
`PayoutSheet` used `presentationStyle="pageSheet"` + `SafeAreaView`/nativewind. Fix: rewrote the wrapper
to match `DriverChatModal` - a plain `<Modal transparent={false}>` wrapping a `<View style={{ flex: 1,
backgroundColor, paddingTop: insets.top }}>` (via `useSafeAreaInsets`), and swapped the in-modal bank
`FlatList` for a `ScrollView` (a FlatList inside a sheet has the same collapse risk).

## Verification
App `tsc` green; no em dashes. Backend endpoints re-probed live. On-device: package momo/card opens the
Paystack sheet on iOS; the service chat list fills the screen with the composer at the bottom and
messages visible; the payout sheet shows the bank picker, amount, fee breakdown, and button text.
Ship: fresh app build (version stays 1.1.4; iOS build number auto-increments). No backend/admin change.
