# Round 48 - Resilient + idempotent email OTP (Microsoft 365 fallback)

## Problem

Email is the OTP channel. `OtpService.createOtp` generated a code, stored it, then called
`EmailService.sendOtp` exactly once against a single relay (Spacemail). One send failure = the OTP request
failed and the user was stuck: no retry, no backup provider.

## Changes

### 1. Provider fallback + STARTTLS (`src/services/email-service.ts`)

- `EmailService.send` now tries the PRIMARY relay and, on failure, a FALLBACK relay
  (`FALLBACK_SMTP_*`). Either success returns true. The socket conversation is factored into a private
  `sendVia(cfg, options)`; the RFC822 message is built per relay so each provider sends as its own `From`.
- Added STARTTLS support (the client previously did implicit TLS 465 / plaintext 25 only): when
  `cfg.starttls`, after EHLO it issues `STARTTLS`, upgrades the socket with `tls.connect({ socket })`, then
  re-EHLOs before AUTH LOGIN. This is what Microsoft 365 (`smtp.office365.com:587`) requires.
- `getFallbackConfig()` returns null unless both a host and a password are set, so an unconfigured fallback
  stays dormant and `send()` behaves exactly as before (primary only) - zero regression.

### 2. Idempotent OTP (`src/services/otp-service.ts`)

- The email branch of `createOtp` reuses an existing unverified, unexpired code created within the last 90s
  for the same phone instead of rotating it. A double-tap or client retry re-sends the SAME code, so a user
  who already received the first email is not invalidated. Outside that window a fresh code is issued as
  before. Delivery then goes through the now provider-resilient `EmailService.sendOtp`.

### 3. Config wiring

- `k8s/configmap.yaml`: `FALLBACK_SMTP_HOST=smtp.office365.com`, `FALLBACK_SMTP_PORT=587`,
  `FALLBACK_SMTP_STARTTLS=true`, `FALLBACK_SMTP_AUTH=true`, `FALLBACK_SMTP_USER/FROM=noreply@velo-brand.com`,
  `FALLBACK_SMTP_FROM_NAME`.
- `.github/workflows/docker-publish.yml`: passes `FALLBACK_SMTP_PASSWORD` (repo secret) through to the VPS
  and patches the same keys into `velo-config` and the password into `velo-secrets` (mirrors `SMTP_PASSWORD`).

## Verification

- `npx tsc --noEmit` clean. No em/en dashes in touched files.
- **Microsoft 365 STARTTLS path (real connection):** a harness mirroring `sendVia` connected to
  `smtp.office365.com:587`, completed STARTTLS + TLS upgrade + EHLO + AUTH LOGIN handshake correctly. Auth was
  rejected by Microsoft with `535 5.7.139 SmtpClientAuthentication is disabled for the Tenant` - a tenant
  policy, not a code or credential fault (see Action required). The STARTTLS implementation is proven correct
  up to the tenant gate.
- **Fallback orchestration (real transpiled `EmailService` against a local fake relay), 6/6 passed:** primary
  success -> true; primary-fail -> fallback -> true; both-fail -> false; unconfigured fallback stays dormant
  (primary-fail -> false); and each relay sends with its own `From` (primary `@velocouriersvc.com`, fallback
  `@velo-brand.com`).
- Primary (Spacemail) path is unchanged behavior and covered by the primary-success test.

## Action required (Microsoft 365 admin - you)

1. Add the GitHub repo secret `FALLBACK_SMTP_PASSWORD` = the `noreply@velo-brand.com` mailbox password.
2. Enable Authenticated SMTP for that mailbox (tenant has it disabled). Either:
   - Admin center: Users > `noreply@velo-brand.com` > Mail > Manage email apps > tick "Authenticated SMTP".
   - Or PowerShell (per mailbox, overrides the tenant default):
     `Set-CASMailbox -Identity noreply@velo-brand.com -SmtpClientAuthenticationDisabled $false`
   Ref: https://aka.ms/smtp_auth_disabled

Until both are done the fallback stays dormant in production; the primary relay and OTP flow are unaffected.

## Deploy

- Backend `develop` -> `main` (CI patches config/secret and rolls out). No app/admin build.
