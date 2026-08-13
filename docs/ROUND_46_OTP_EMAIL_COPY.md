# Round 46 - OTP verification copy now says "email" (the code is emailed)

Round 44 moved the one-time code from Prelude SMS to EMAIL, but the mobile verification UI still said
phone/SMS. Copy-only fix (no backend, no logic change).

## Changes (mobile app `VeloHUB`)

- `components/auth/code-verification-modal.tsx`: added an optional `email?` prop; when set the modal reads
  "Check your email / We've sent a 6-digit code to <email> to confirm it's you." (falls back to the masked
  phone copy if no email is passed).
- `app/(auth)/login.tsx`: passes `email={email}` (already collected by `useLoginForm`) to the confirmation
  modal. Also fixed a stray en dash in a comment.
- `app/(auth)/otp-verification.tsx`: reads `signupEmail` from the auth store; heading -> "Verify your email";
  "code sent to {phone}" -> "sent to {signupEmail || 'your email'}"; "Wrong number?" -> "Wrong email or
  number?"; the stale "No SMS? Email me the code" fallback relabeled to "Sent to the wrong email? Use a
  different one" (still calls `handleEmailResend`); the resend-confirmation modal now gets `email`.

## Prelude status (answering "is Prelude still relevant?")

For OTP: no - it is fully email now (the Prelude OTP path was commented out in Round 44). Prelude remains wired
only for non-OTP `notification-service.notifyBySms/notifyByWhatsApp` and the ride shared-contact SMS; it can be
fully retired on request.

## Verification

- App `tsc --noEmit` clean; no "-" em/en dashes in touched files.
- Flow (code review + the Round 44 live email-OTP verification): confirmation modal + verify screen reference
  the email; resend re-emails.

## Deploy

- App -> `master` + `eas build`. Rides the open 1.1.8 build (build number auto-increments) unless 1.1.8 was
  approved, in which case bump `expo.version`.
