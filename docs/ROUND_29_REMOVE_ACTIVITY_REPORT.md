# Round 29 - remove the "Request Activity Report" feature

Date: 2026-07-28

## Why
The "Request Activity Report" button on the profile screen always failed with
"Email service is not configured on this server." `ReportService.sendActivityReport()`
emails a CSV of the user's rides + wallet transactions, but `EmailService.isConfigured()`
is `!!process.env.SMTP_HOST`, and `SMTP_HOST` is not set on the production k3s deployment.
Rather than stand up SMTP + mail deliverability (SPF/DKIM), we removed the feature.

## Changes
App (`VeloHUB`):
- `app/profile/personal-info.tsx`: removed the "Request Activity Report" button, the
  `onRequestReport` handler, and the `isRequestingReport` state. "Save changes" is now the
  last control on the screen.
- `repositories/profile-repository.ts`: removed `requestActivityReport()`.

Backend (`VeloHUB-backend`):
- `src/routes/profileRoutes.ts`: removed `POST /profile/report`.
- `src/controllers/ProfileController.ts`: removed the `ReportService` import, the
  `reportService` field, and the `generateActivityReport` handler.
- Deleted `src/services/report-service.ts`.
- `src/services/email-service.ts` kept (still used by `AdminController` and `otp-service`).

## Verify
- App + backend `tsc` clean; no residual references to `requestActivityReport`,
  `ReportService`, `generateActivityReport`, or "Activity Report"; no em dashes on touched files.
- After deploy, `POST /api/v1/profile/report` returns 404.
- Ship: fresh app build (version stays 1.1.4); backend via develop -> CI auto-deploy.
