import Stripe from "stripe";
import { AppDataSource } from "../../db/data-source";
import { Identification, IdentificationStatus } from "../../models/identification";
import { User } from "../../models/user";
import { DriverProfile, DriverVerificationStatus } from "../../models/driver-profile";
import { MerchantProfile } from "../../models/merchant-profile";
import { BuyerProfile } from "../../models/buyer-profile";
import {
    STRIPE_IDENTITY_API_VERSION,
    STRIPE_IDENTITY_WEBHOOK_SECRET,
} from "../../config/stripe";
import { createServiceLogger } from "../../utils/logger";

const log = createServiceLogger("IdentityVerificationService");

/** Error kinds the controller maps onto HTTP status codes. */
export type IdentityErrorCode = "not_configured" | "user_not_found" | "provider_error";

export class IdentityError extends Error {
    constructor(
        public readonly code: IdentityErrorCode,
        message: string,
        public readonly cause?: unknown,
    ) {
        super(message);
        this.name = "IdentityError";
    }
}

/**
 * Pulls the fields that actually explain a Stripe failure out of the error.
 * Logging only error.message was why identity failures were undiagnosable:
 * Stripe puts the actionable part in type/code/statusCode/requestId.
 */
function describeStripeError(error: unknown): Record<string, unknown> {
    const e = error as Partial<Stripe.errors.StripeError> & { message?: string };
    return {
        message: e?.message,
        type: e?.type,
        code: e?.code,
        statusCode: e?.statusCode,
        requestId: e?.requestId,
        param: (e as any)?.param,
        docUrl: (e as any)?.doc_url,
    };
}

export class IdentityVerificationService {
    private stripe: Stripe | null;

    constructor() {
        // Only build the client when a key is present so a missing key cannot
        // break the service (or any controller that constructs it).
        const key = process.env.STRIPE_SECRET_KEY;
        this.stripe = key ? new Stripe(key, { apiVersion: STRIPE_IDENTITY_API_VERSION as any }) : null;
    }

    private requireStripe(): Stripe {
        if (!this.stripe) {
            throw new IdentityError(
                "not_configured",
                "Identity verification is not configured (STRIPE_SECRET_KEY is not set)",
            );
        }
        return this.stripe;
    }

    /**
     * Create a new verification session for a user.
     */
    async createVerificationSession(userId: string) {
        log.info("Creating verification session", { userId });

        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({
            where: { id: userId },
            // buyerProfile is loaded too: buyers can verify, and without it the
            // existing Identification was never found and never linked back.
            relations: ["driverProfile", "merchantProfile", "buyerProfile"],
        });

        if (!user) {
            throw new IdentityError("user_not_found", "User not found");
        }

        // 1. Reuse an Identification already attached to any of this user's
        //    profiles so retrying does not orphan rows.
        const identificationRepository = AppDataSource.getRepository(Identification);

        const identificationId =
            user.driverProfile?.identificationId ||
            user.merchantProfile?.identificationId ||
            user.buyerProfile?.identificationId;
        let identification = identificationId
            ? await identificationRepository.findOne({ where: { id: identificationId } })
            : null;

        // 2. Create the VerificationSession in Stripe.
        const stripe = this.requireStripe();
        let session: Stripe.Identity.VerificationSession;
        try {
            session = await stripe.identity.verificationSessions.create({
                type: "document",
                options: {
                    document: {
                        require_id_number: true,
                        require_live_capture: false,
                        require_matching_selfie: true,
                    },
                } as any,
                metadata: {
                    userId: user.id,
                    role: user.activeRole || "unknown",
                },
            });
        } catch (error) {
            log.error("Stripe verificationSessions.create failed", {
                userId,
                apiVersion: STRIPE_IDENTITY_API_VERSION,
                ...describeStripeError(error),
            });
            throw new IdentityError(
                "provider_error",
                "Could not start identity verification with the provider",
                error,
            );
        }

        // 3. Store the session id against our record.
        if (!identification) {
            identification = new Identification();
            identification.type = "Stripe Identity";
            // idNumber is UNIQUE; the session id keeps it collision-free until
            // the real document number arrives from the verification report.
            identification.idNumber = `STRIPE_${session.id}`;
            identification.issuingCountry = user.country || "GHA";
            identification.frontUrl = "pending";
        }
        identification.status = IdentificationStatus.PENDING;
        identification.stripeVerificationSessionId = session.id;
        await identificationRepository.save(identification);

        // 4. Link the record to whichever profiles this user has. Previously
        //    only the driver profile was written back, so merchants and buyers
        //    stayed "unverified" forever and every attempt created a new row.
        await this.linkIdentificationToProfiles(user, identification.id);

        // 5. Ephemeral key for the mobile SDK.
        let ephemeralKey: Stripe.EphemeralKey;
        try {
            ephemeralKey = await stripe.ephemeralKeys.create(
                { verification_session: session.id },
                { apiVersion: STRIPE_IDENTITY_API_VERSION as any },
            );
        } catch (error) {
            log.error("Stripe ephemeralKeys.create failed", {
                userId,
                sessionId: session.id,
                identityApiVersion: STRIPE_IDENTITY_API_VERSION,
                ...describeStripeError(error),
            });
            throw new IdentityError(
                "provider_error",
                "Could not prepare the identity verification session",
                error,
            );
        }

        log.info("Verification session created", { userId, sessionId: session.id });

        return {
            id: session.id,
            clientSecret: session.client_secret,
            ephemeralKeySecret: ephemeralKey.secret,
        };
    }

    /**
     * Point every profile this user has at the Identification record, so the
     * status lookup resolves regardless of which role they verified under.
     */
    private async linkIdentificationToProfiles(user: User, identificationId: string) {
        if (user.driverProfile && user.driverProfile.identificationId !== identificationId) {
            user.driverProfile.identificationId = identificationId;
            await AppDataSource.getRepository(DriverProfile).save(user.driverProfile);
        }
        if (user.merchantProfile && user.merchantProfile.identificationId !== identificationId) {
            user.merchantProfile.identificationId = identificationId;
            await AppDataSource.getRepository(MerchantProfile).save(user.merchantProfile);
        }
        if (user.buyerProfile && user.buyerProfile.identificationId !== identificationId) {
            user.buyerProfile.identificationId = identificationId;
            await AppDataSource.getRepository(BuyerProfile).save(user.buyerProfile);
        }
    }

    /**
     * Handle Stripe webhooks for identity verification.
     */
    async handleWebhook(payload: string, signature: string) {
        let event: Stripe.Event;

        try {
            event = this.requireStripe().webhooks.constructEvent(
                payload,
                signature,
                STRIPE_IDENTITY_WEBHOOK_SECRET,
            );
        } catch (err) {
            log.error("Webhook signature verification failed", {
                hasSecret: Boolean(STRIPE_IDENTITY_WEBHOOK_SECRET),
                ...describeStripeError(err),
            });
            throw new Error(`Webhook Error: ${(err as Error).message}`);
        }

        log.info("Handling Stripe Webhook", { type: event.type });

        const session = event.data.object as Stripe.Identity.VerificationSession;
        const userId = session.metadata?.userId;

        if (!userId) {
            log.warn("Webhook session missing userId in metadata", { sessionId: session.id });
            return;
        }

        const identificationRepository = AppDataSource.getRepository(Identification);
        const identification = await identificationRepository.findOne({
            where: { stripeVerificationSessionId: session.id },
        });

        if (!identification) {
            log.error("Identification record not found for session", { sessionId: session.id });
            return;
        }

        switch (event.type as string) {
            case "identity.verification_session.verified":
                await this.handleVerified(identification, session, userId);
                break;
            case "identity.verification_session.requires_input":
                log.info("Verification requires input", { userId, sessionId: session.id });
                identification.status = IdentificationStatus.PENDING;
                await identificationRepository.save(identification);
                break;
            case "identity.verification_session.canceled":
            case "identity.verification_session.failed":
                log.warn("Verification failed or canceled", { userId, sessionId: session.id });
                identification.status = IdentificationStatus.REJECTED;
                await identificationRepository.save(identification);
                break;
        }
    }

    private async handleVerified(
        identification: Identification,
        session: Stripe.Identity.VerificationSession,
        userId: string,
    ) {
        log.info("Identity verified successfully", { userId, sessionId: session.id });

        identification.status = IdentificationStatus.VERIFIED;
        identification.stripeVerificationReportId = session.last_verification_report as string;

        // Enrich from the verification report when one is available. A failure
        // here must not lose the VERIFIED status, so it is best-effort.
        if (session.last_verification_report) {
            try {
                const report = await this.requireStripe().identity.verificationReports.retrieve(
                    session.last_verification_report as string,
                );
                if (report.document) {
                    // idNumber is UNIQUE across identifications, so only adopt
                    // the real document number when nothing else holds it.
                    const documentNumber = report.document.number;
                    if (
                        documentNumber &&
                        (await this.isIdNumberFree(documentNumber, identification.id))
                    ) {
                        identification.idNumber = documentNumber;
                    }
                    identification.issuingCountry =
                        (report.document as any).issuance?.country || identification.issuingCountry;
                    identification.type = report.document.type || identification.type;
                }
            } catch (error) {
                log.warn("Could not enrich identification from verification report", {
                    userId,
                    reportId: session.last_verification_report,
                    ...describeStripeError(error),
                });
            }
        }

        await AppDataSource.getRepository(Identification).save(identification);

        const driverRepository = AppDataSource.getRepository(DriverProfile);
        const driverProfile = await driverRepository.findOne({ where: { userId } });

        if (driverProfile && driverProfile.status === DriverVerificationStatus.PENDING) {
            // Identity is verified; the driver still goes through final review.
            log.info("Driver profile ready for final review (identity verified)", { userId });
        }
    }

    /** Guards the UNIQUE constraint on identifications.idNumber. */
    private async isIdNumberFree(idNumber: string, selfId: string): Promise<boolean> {
        const existing = await AppDataSource.getRepository(Identification).findOne({
            where: { idNumber },
            select: { id: true },
        });
        return !existing || existing.id === selfId;
    }
}
