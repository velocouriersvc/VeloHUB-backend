# Round 28 - service chat sent messages + service out-call address autocomplete (app-side)

Date: 2026-07-28

Both app-side; backend unchanged and verified live.

## 1. Service booking chat: sent message never appeared
`app/chat/[id].tsx` used `SafeAreaView className="flex-1"` as the container. nativewind's `flex-1` did
not reliably apply to the third-party `SafeAreaView`, so it did not fill the screen and the message
`FlatList` (`flex:1`) had no bounded height and collapsed to ~0; the composer sat at the top and no
message rendered. Fix: replaced the container with a plain
`<View style={{ flex: 1, backgroundColor, paddingTop: insets.top }}>` (via `useSafeAreaInsets`),
matching the working `DriverChatModal`. The message list now fills the screen and messages render
(sent + received). Verified live: `GET /services/bookings/:id/messages` returns the 5-message
conversation that now displays.

## 2. Service out-call address: no location suggestions
`app/services/product/[id].tsx` used a plain `TextInput` + `Location.geocodeAsync` (no autocomplete).
Fix: wired in the shared `usePlaceSearch` hook (Google Places autocomplete), render a suggestions
dropdown under the address input, and on select resolve the `place_id` to coordinates via Google
place/details (mirroring `useRideFlow`), setting the address + coords and running the out-call quote.
"Use my location" / "Check availability" remain as fallbacks.

Also hardened the Maps key: `usePlaceSearch` + `useRideFlow` place-details now use `getMapsApiKey()`
(`constants/maps.ts`, the Round 25 fallback to the embedded native key) instead of the raw
`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` env var, so autocomplete works even if the env var is unset. Verified
the embedded key returns predictions for "Speedaf Express Tema" (status OK).

## Verify
App `tsc` green; no em dashes; no remaining raw `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` reads outside
`constants/maps.ts`. Ship: fresh app build (version stays 1.1.4).
