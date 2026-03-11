import { AppDataSource } from "../db/data-source";
import { Otp } from "../models/otp";
import { TwilioService } from "./twilio-service";
import { MoreThan } from "typeorm";
import { createServiceLogger } from "../utils/logger";
import { authEventsTotal } from "../utils/metrics";

const log = createServiceLogger("OtpService");

export class OtpService {
    private otpRepository = AppDataSource.getRepository(Otp);

    async createOtp(phoneNumber: string): Promise<string> {
        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        log.info("OTP generated for phone number", { phoneNumber: "[MASKED]" });
        authEventsTotal.inc({ event: "otp_requested" });

        // Set expiry to 10 minutes from now
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        // Deactivate previous OTPs for this phone number
        await this.otpRepository.delete({ phoneNumber });

        const otp = this.otpRepository.create({
            phoneNumber,
            code,
            expiresAt,
        });

        await this.otpRepository.save(otp);

        // Send SMS via Twilio
        const twilioService = new TwilioService();
        try {
            await twilioService.sendSMS(phoneNumber, `Your verification code is: ${code}`);
            log.info("OTP SMS sent successfully");
        } catch (error) {
            log.error("Failed to send OTP SMS", { error: (error as Error).message });
        }
        return code;
    }

    async verifyOtp(phoneNumber: string, code: string): Promise<boolean> {
        const otp = await this.otpRepository.findOne({
            where: {
                phoneNumber,
                code,
                expiresAt: MoreThan(new Date()),
                isVerified: false,
            },
        });

        if (!otp) {
            log.warn("OTP verification failed — invalid or expired");
            authEventsTotal.inc({ event: "otp_failed" });
            return false;
        }

        // Mark as verified instead of immediate deletion to allow for potential audit
        otp.isVerified = true;
        await this.otpRepository.save(otp);

        log.info("OTP verified successfully");
        authEventsTotal.inc({ event: "otp_verified" });

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
