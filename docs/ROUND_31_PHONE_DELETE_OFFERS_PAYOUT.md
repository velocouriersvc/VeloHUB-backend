# Round 31 - phone-format auth, account deletion, disable Offers Apply, payout note

Date: 2026-07-29

Four app-testing issues. Root-caused against code + the live production DB (627 users).

## 1. Old users: "Invalid phone number format" on Food Delivery (backend)
The app sends `x-user-phone` = the stored phone verbatim; `role-middleware` rejected it when
`validatePhoneNumber` (`src/utils/phone-validator.ts`) failed. ~12 legacy users have national-format
numbers with a leading 0 (e.g. `0536690447`); the validator re-added `+` (`+0536...`) and threw.

Fix: rewrite `validatePhoneNumber` to try an ordered set of candidates and never throw out - E.164
as-is, bare-international with re-added `+` (only when NOT leading 0), an explicit countryCode, then
the app markets `['GH','NG','US']` for national numbers. Returns the first valid match as E.164. The
middleware is unchanged (its `possibleFormats` already includes the raw value, so the stored row still
matches). E.164 and no-plus `233...` users are unaffected. Unit test added for the leading-0 case.

Verified live: `GET /auth/me` with `x-user-phone: 0536690447` returns 200 (was 400).

## 2. Deleted account could still log in (backend + data cleanup)
`deleteMyAccount` only nulled `email`, set `deletedAt`, and wrote a non-existent `isActive` column
(no-op); it kept `phoneNumber`. The tester also had a duplicate pair (`233243029139` soft-deleted vs
`+233243029139` active from inconsistent phone formatting at signup), so `/auth/me` returned the
surviving active duplicate and login still worked.

Fix (`src/services/profile-service.ts`): in a transaction, release the unique identifiers
(`phoneNumber`, `email`, `appleSubjectId` = null), set `status = INACTIVE` + `deletedAt`, scrub profile
PII, and ALSO soft-delete + release any duplicate rows sharing the phone (matched by the last 9
digits). Freeing the number means a future OTP with it creates a fresh, empty account (standard
delete-then-signup). The shared login lookup for all users was deliberately left untouched.

One-time production data cleanup (idempotent, dry-run first): (a) released + soft-deleted the 2 active
rows that duplicated an already-deleted account (the tester's `0243029139` and `+233243029139`);
(a2) scrubbed PII on all 10 soft-deleted users' profiles; (b) freed identifiers on all 10 soft-deleted
rows. The all-active duplicate pairs (incl. the real driver `203671712`) were correctly not touched.
Post-cleanup: 0 soft-deleted rows hold identifiers; 0 active rows carry the tester's number.

## 3. Disable the Round 30 Offers one-tap "Apply" (app, commented out)
Gated the Round 30 Apply flow behind `APPLY_ENABLED = false` in `app/offers/index.tsx` (all offers
fall back to copy-only, nothing hidden) and commented the `getAppliedPromo` auto-load in
`app/checkout.tsx` (so `promoCode` stays null, the chip is hidden, and no promoCode is sent). All code
is kept intact to restore later. The Round 30 food-delivery ETA feature is unaffected.

## 4. Early-withdrawal note on both payout screens (app)
Added (verbatim, no em dash): "Transactions processed on or before the payout schedule will be
available for early withdrawal within 48 hours".
- Driver `app/(driver-tabs)/request-payout.tsx`: appended to the existing Payout Schedule banner.
- Merchant `app/(seller-tabs)/request-payout.tsx`: added a matching Payout Schedule banner.

## Verify / ship
- Backend + app `tsc` clean; phone-validator test passes (7/7); no em dashes on touched files.
- Backend shipped develop -> main (production). App -> master; needs a fresh `eas build` (version
  stays 1.1.4) for the Offers/payout UI to reach testers.
