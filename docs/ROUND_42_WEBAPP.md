# Round 42 - Velo customer web app (velocouriersvc.com)

Six fixes on the self-contained web app (`velocouriersvc.com/index.html` homepage, `dashboard.html` app;
inline CSS/JS, no framework; deployed to Vercel - the user uploads). No backend CODE change; issue 4 is
config-only. Design system preserved (trust-blue `#123C86`, action-orange `#F2761A`, Sora/Inter/IBM Plex Mono,
no emoji, no "-" em/en dashes).

## Issue 1 - Logo
The VELO gradient wordmark (`files/logo-for-website.png`) is copied to
`velocouriersvc.com/assets/velo-logo-wordmark.png` and shown in the header `.brand` of both `index.html` and
`dashboard.html` (`<img height 28-30>`). Footers keep the white text wordmark (dark background contrast).

## Issue 2 - Exact location for nearby stores
`dashboard.html` `loadShop()` and `openLocal()` now build the `/products` query from the customer's precise
GPS `state.coords` when granted (`(state.coords&&state.coords.lat)||state.hub.lat`), falling back to the city
hub center. `detectGPS()`/`initLocation()` already set `state.coords` and refresh the shop, so nearby stores
now rank to the user's exact location, not just the city.

## Issue 4 - Forgot / Reset password via email
Backend already implements it (numeric 6-digit code): `POST /auth/forgot-password {email}` ->
`POST /auth/reset-password {email,code,newPassword}`. Added the web UI:
- `index.html`: a "Forgot password?" link in the login view + a 2-step reset panel (`#authReset`): email ->
  send code -> code + new password -> reset -> back to login. Also opens via `/#reset` deep link.
- `dashboard.html`: login shows a "Forgot password?" link to `/#reset` (homepage reset flow).
- Backend config (NO code change): `k8s/configmap.yaml` switched to Spacemail
  (`SMTP_HOST=mail.spacemail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_AUTH=true`,
  `SMTP_USER=noreply@velocouriersvc.com`). `SMTP_PASSWORD` must be set in the `velo-secrets` Secret via
  kubectl (NOT committed). Then `kubectl apply -f k8s/configmap.yaml` + patch the secret +
  `kubectl rollout restart deployment/velo-api`. Port 465 implicit TLS is required (the SMTP client has no
  STARTTLS).

## Issue 5 - Profile menu + greeting
`dashboard.html`: the "U" avatar used to fire a `confirm()` logout. It now opens a profile drawer
(`openProfile()`): greeting "Hello <firstName>", Edit name (`PATCH /profile/me { fullName }` -> updates the
local session + greeting/avatar), Set delivery address / location (saved to `localStorage['veloAddress']` for
checkout + a "Use precise location" button calling `detectGPS()`), and Log out; with a close button. The
header greeting now reads "Hello <name>". (Note: the name field is `fullName` camelCase, not `full_name`.)

## Issue 6 - Coverage map "Where Velo operates"
New "Coverage" tab on `dashboard.html` with a Leaflet + OpenStreetMap map (lazy-loaded from unpkg CDN; same
stack as the driver app / admin LiveMap). Plots the 10 operating cities (`HUBS`) as markers with `RADIUS_KM`
coverage circles (`fitBounds` for the global view) and live shop pins colored by category, mimicking the
driver demand map (`MERCHANT_COLORS`/`merchantBucket`: food/pharmacy/grocery/marketplace/services). Merchant
locations come from the public `GET /products?lat=&lng=&radius=`. Includes a legend. No backend change.

## Issue 7 - Service Providers merged into Merchants
No provider role exists in the backend. `index.html`: the Merchant lane is relabeled
"Merchants & Service Providers" (copy mentions offering services; button "Sign Up to Sell or Offer Services"),
and the "Service provider? ..." link now opens the Merchant signup (`data-auth="signup" data-role="merchant"`)
instead of scrolling to `#partners`.

## Verification
- Both pages' inline JS parses (`node --check`); no emoji added; no "-" em/en dashes.
- Live backend (throwaway account, deleted after): `PATCH /profile/me { fullName }` updates the name (verified
  via `/auth/me`); `GET /products?lat=&lng=&radius=` returns merchants with coordinates for the map;
  `POST /auth/forgot-password` -> 200; `POST /auth/reset-password` with a bad code -> 400.
- Email delivery (issue 4) needs the Spacemail SMTP applied to the cluster + a real inbox to fully confirm.

## Deploy
- Web app: the USER uploads `index.html`, `dashboard.html`, `assets/velo-logo-wordmark.png` to Vercel.
- Backend: no code change. Apply the SMTP config: set `SMTP_PASSWORD` in `velo-secrets`,
  `kubectl apply -f k8s/configmap.yaml`, `kubectl rollout restart deployment/velo-api`.
