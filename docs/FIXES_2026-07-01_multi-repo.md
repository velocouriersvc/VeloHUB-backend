# Progress - 2026-07-01 (multi-repo batch)

Spans VeloHUB (app), VeloHUB-backend, velo-admin (admin dashboard), velocouriersvc.com.
NOTE: partway through, the sandbox's command classifier went offline, blocking SSH,
typecheck, tests and commits. Code edits below are complete; items marked PENDING
need the server or a typecheck run to finish.

## APP

### 1. Ride summary - Confirm button hidden by the bottom bar  [FIXED, app]
Root cause: on the summary step the sheet opens at `summaryTranslateY` (75% height),
but the pan gesture's `onEnd` snap positions for 'summary' were `[foundTranslateY, 0]`
(58%). Any drag to scroll snapped the sheet down to 58%, hiding the Confirm button,
and it could not be brought back.
- `app/rides.tsx`: summary now snaps to `[summaryTranslateY, 0]` (its own full height).
- `components/rides/constants.ts`: `SHEET_SUMMARY_HEIGHT` 0.75 -> 0.85 for headroom.
- `components/rides/RideSummary.tsx`: ScrollView bottom padding now `120 + insets.bottom`
  (clears the Android system nav bar) + `keyboardShouldPersistTaps="handled"`.

### 2. Password reset - no code received  [ROOT CAUSE FOUND; fix PENDING server]
Flow is email-based: `forgot-password.tsx` -> `AuthRepository.forgotPassword(email)` ->
`auth-service.requestPasswordReset` -> `otpService.createOtp(key, "email", email)` ->
`EmailService.sendOtp` (raw SMTP). `EmailService.send()` returns false when `SMTP_HOST`
is unset, and `requestPasswordReset` swallows the failure (by design, to not reveal which
emails exist). Login OTP works because it uses Prelude (SMS), NOT SMTP.
=> Most likely: SMTP is not configured on the production backend, so reset emails never
   send. Also, phone-only users (no email on file) can't use email reset at all.
PENDING (needs SSH): check backend env for `SMTP_HOST/PORT/FROM/AUTH/USER/PASSWORD`.
  - If missing: configure an SMTP relay (or host Postfix) and set the env, OR
  - Add phone-based reset (send OTP via Prelude SMS to the user's phone, then set new
    password) since SMS already works - most robust for a phone-first app.

## ADMIN (velo-admin + backend)

### 3. Admin dashboard could not authenticate  [FIXED in source; needs rebuild+deploy]
`velo-admin/src/api/base44Client.js` hard-coded `API_KEY = 'your-api-key-here'`. The
backend `apiKeyMiddleware` rejects any `x-api-key` != `process.env.API_KEY` with 403, so
EVERY `/admin/*` call failed. Fixed: key is now `import.meta.env.VITE_API_KEY` with the
production key as default (same `velo_live_...` gate the app + marketing site use).
PENDING (needs SSH): verify `velo_live_e260cb9c4ea694d5cb9beab767f978eec28e471c21f0d395`
equals the backend `API_KEY` env, then rebuild the `velo-frontend` image and redeploy.

### 4. Admin login / admin user  [PLAN ready; needs server]
Auth = phone + OTP; `requireRole(["admin"])` matches the user by `x-user-phone` and checks
for an APPROVED `admin` role. Two ready paths:
- Guest bypass: phones `+233000000000` / `+233000000001` auto-provision SUPER_ADMIN+ADMIN
  (role-middleware). The dashboard's "Guest 1" button uses this - works once the API key
  is fixed.
- Real admin: `POST /api/v1/setup/create-admin { phoneNumber, email, fullName }`
  (no-auth bootstrap) assigns the admin role; then log in by phone + OTP.
PENDING (needs SSH or a valid API-key HTTPS call): create the user's admin account and
verify `/auth/me` returns the admin role.

### 5. Admin endpoint audit - dashboard vs backend  [2 FIXED, gaps listed]
Fixed (frontend path corrections to match existing backend routes):
- creditWallet/debitWallet -> `/admin/users/:id/(credit|debit)-wallet`
- Dashboard.getReport -> `/admin/reports/revenue`
Remaining gaps (backend endpoints the dashboard calls but that are missing) - PENDING a
typecheck run to add safely:
- DELETE `/admin/drivers/:id` (Driver.delete)
- DELETE `/admin/merchants/:id` (Merchant.delete)
- GET `/admin/notifications` + DELETE `/admin/notifications/:id` (Notification.list/delete)
- POST `/admin/settings` (PlatformSettings.create; PUT `/settings/:country` exists)
- PATCH `/admin/rides/:id` (Order.update) - Orders page mostly uses `/orders/*` which exist

### 6. Product tracking - how to test  [ANSWER]
Order/product tracking is implemented end-to-end in the app at `app/orders/track.tsx`
(status timeline + live driver map via `react-native-maps` + socket `subscribeToOrder`
and polling). To test:
- Real: place a product order in the app -> admin Orders page dispatches a driver
  (AutoDispatchButton) -> track live on the app screen and admin `LiveTrackingMap`.
- Controlled: admin `RideSimulator` (`/admin/simulate/ride` + advance) walks a
  ride/delivery through every status. (There is no separate ORDER simulator yet; the ride
  simulator is the closest controlled harness.)

### DB question (Supabase vs same backend)
Backend uses Postgres via TypeORM (`data-source.ts`), connecting via `DATABASE_URL` (which
may be a Supabase string) or discrete `DB_*` vars. The admin dashboard and the app both
call the SAME API (`api.velocouriersvc.com`), so admin/app/DB are already unified through
one backend. PENDING (needs SSH): read `DATABASE_URL` to confirm whether it points at
Supabase or the local Contabo Postgres, per the user's request.

## WEB APP (velocouriersvc.com)
`assets/config.js` already sets `API_KEY: velo_live_e260...` and `API_BASE`. Same key as
the admin default. PENDING: verify the key against the backend, then confirm auth.js /
products.js flows against live endpoints. (`__MACOSX/` is zip cruft and can be removed.)

## Queued server commands (run when SSH is back)
1. `printenv | grep -E "API_KEY|SMTP_|DATABASE_URL|PAYSTACK"` on the api pod/container.
2. If API_KEY matches velo_live_e260... -> rebuild velo-frontend with it; else update the
   default in base44Client.js + config.js to the real value.
3. `curl -s -X POST https://api.velocouriersvc.com/api/v1/setup/create-admin -H 'x-api-key: <real>' -H 'Content-Type: application/json' -d '{"phoneNumber":"<user phone>","fullName":"Velo Admin"}'`
   then verify `/auth/me` shows the admin role.
4. Check SMTP env; configure relay or add SMS-based reset.
