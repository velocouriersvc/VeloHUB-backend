import Stripe from "stripe";

/**
 * API version used by the Stripe Identity integration.
 *
 * This previously hard-coded "2026-02-25.clover", which is not a version the
 * installed server SDK ships (stripe-node 21.x is built for the "dahlia"
 * series) and is not the version the working payment flow uses. Stripe
 * rejects an unrecognised version outright, which surfaced in the app as
 * "internal server error" when starting ID verification.
 *
 * Defaulting to the SDK's own pinned version guarantees a version Stripe
 * recognises and that the SDK can parse. It stays overridable so it can be
 * realigned with a mobile SDK upgrade without a code change.
 */
export const STRIPE_IDENTITY_API_VERSION =
    process.env.STRIPE_IDENTITY_API_VERSION || Stripe.API_VERSION;

/**
 * Stripe issues a separate signing secret per webhook endpoint. Identity is
 * registered as its own endpoint (/api/v1/identity/webhook), so it cannot
 * share the payments endpoint secret: whichever one did not match would fail
 * signature verification and silently never update a verification result.
 * Falls back to the payments secret so a single-endpoint setup keeps working.
 */
export const STRIPE_IDENTITY_WEBHOOK_SECRET =
    process.env.STRIPE_IDENTITY_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || "";
