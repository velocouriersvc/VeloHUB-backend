import { AppDataSource } from "../db/data-source";
import { Otp } from "../models/otp";
import { PreludeService } from "./prelude-service";
import { MoreThan } from "typeorm";
import { createServiceLogger } from "../utils/logger";
import { authEventsTotal } from "../utils/metrics";

const log = createServiceLogger("OtpService");

export class OtpService {
    private otpRepository = AppDataSource.getRepository(Otp);
    private preludeService = new PreludeService();

    async createOtp(phoneNumber: string, channel: 'sms' | 'whatsapp' = 'sms'): Promise<string> {
        log.info("OTP verification requested for phone number", { phoneNumber: "[MASKED]", channel });
        authEventsTotal.inc({ event: "otp_requested", channel });

        // Trigger Prelude's verification - they handle code generation and channel selection (SMS/WhatsApp)
        const verificationId = await this.preludeService.sendVerification(phoneNumber);

        // Optional: still store metadata in the DB for audit/history
        // We store the verificationId in the code field just for record-keeping if needed,
        // although we don't know the actual code Prelude generates.
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        // Deactivate previous OTPs for this phone number
        await this.otpRepository.delete({ phoneNumber });

        const otp = this.otpRepository.create({
            phoneNumber,
            code: verificationId.slice(0, 6), // Reference to the verification request
            expiresAt,
            channel,
        });

        await this.otpRepository.save(otp);
        
        log.info(`OTP request sent successfully via Prelude`);
        return verificationId;
    }

    async verifyOtp(phoneNumber: string, code: string): Promise<boolean> {
        // Verification is now handled entirely by Prelude
        const isVerifiedByPrelude = await this.preludeService.checkVerification(phoneNumber, code);

        if (!isVerifiedByPrelude) {
            log.warn("OTP verification failed via Prelude — invalid or expired code");
            authEventsTotal.inc({ event: "otp_failed", channel: "unknown" });
            return false;
        }

        // Mark local record as verified if it exists
        const otp = await this.otpRepository.findOne({
            where: {
                phoneNumber,
                isVerified: false,
            },
            order: { createdAt: "DESC" }
        });

        if (otp) {
            otp.isVerified = true;
            await this.otpRepository.save(otp);
        }

        log.info("OTP verified successfully by Prelude");
        authEventsTotal.inc({ event: "otp_verified", channel: otp?.channel || "prelude" });

        return true;
    }

    async cleanup(): Promise<void> {
        // Delete expired or verified OTPs
        const result = await this.otpRepository.createQueryBuilder()
            .delete()
            .where("expiresAt < :now", { now: new Date() })
            .orWhere("isVerified = :verified", { verified: true })
            .execute();

        log.info("OTP cleanup completed", { deletedCount: result.affected || 0 });
    }
}
