import { AppDataSource } from "../db/data-source";
import { Otp } from "../models/otp";
import { PreludeService } from "./prelude-service";
import { MoreThan } from "typeorm";
import { createServiceLogger } from "../utils/logger";
import { authEventsTotal } from "../utils/metrics";
import { EmailService } from "./email-service";

const log = createServiceLogger("OtpService");

export class OtpService {
    private otpRepository = AppDataSource.getRepository(Otp);
    private preludeService = new PreludeService();

    async createOtp(phoneNumber: string, channel: 'sms' | 'whatsapp' | 'email' = 'sms', email?: string): Promise<string> {
        log.info("OTP verification requested for phone number", { phoneNumber: "[MASKED]", channel });
        authEventsTotal.inc({ event: "otp_requested", channel });

        // Bypass Prelude for test numbers
        const testNumbers = ["+233000000000", "+233000000001", "+23300000000", "+23300000001"];
        if (testNumbers.includes(phoneNumber)) {
            log.info("Bypassing Prelude for test phone number", { phoneNumber });
            
            // Store a local record for the bypass code 123456
            await this.otpRepository.delete({ phoneNumber });
            const otp = this.otpRepository.create({
                phoneNumber,
                code: "123456",
                expiresAt: new Date(Date.now() + 30 * 60000), // 30 mins
                channel,
            });
            await this.otpRepository.save(otp);
            return "test-session-id";
        }

        // EMAIL OTP is now the verification channel (Prelude SMS is disabled to save cost). When an
        // email is supplied we generate the code locally and deliver it via SMTP (EmailService).
        if (email) {
            const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
            const expiresAt = new Date(Date.now() + 10 * 60000); // 10 mins

            await this.otpRepository.delete({ phoneNumber });
            const otp = this.otpRepository.create({ phoneNumber, code, expiresAt, channel: 'email' });
            await this.otpRepository.save(otp);

            const sent = await EmailService.sendOtp(email, code);
            if (!sent) {
                throw new Error("Failed to send the email verification code. Please try again.");
            }
            log.info("Email OTP sent successfully");
            return "email-otp";
        }

        // ── Prelude SMS/WhatsApp OTP: DISABLED to save cost (kept for easy re-enable) ──
        // To restore SMS OTP, uncomment this block and stop requiring an email above.
        // const verificationId = await this.preludeService.sendVerification(phoneNumber);
        // const expiresAt = new Date();
        // expiresAt.setMinutes(expiresAt.getMinutes() + 10);
        // await this.otpRepository.delete({ phoneNumber });
        // const otp = this.otpRepository.create({ phoneNumber, code: verificationId.slice(0, 6), expiresAt, channel });
        // await this.otpRepository.save(otp);
        // log.info("OTP request sent successfully via Prelude");
        // return verificationId;

        throw new Error("An email address is required to send a verification code.");
    }

    async verifyOtp(phoneNumber: string, code: string): Promise<boolean> {
        // Bypass for test numbers
        const testNumbers = ["+233000000000", "+233000000001", "+23300000000", "+23300000001"];
        if (testNumbers.includes(phoneNumber) && code === "123456") {
            log.info("OTP bypass successful for test phone number", { phoneNumber });
            return true;
        }

        // Email OTP: verify against the locally-stored code (Prelude is not involved).
        const emailOtp = await this.otpRepository.findOne({
            where: {
                phoneNumber,
                channel: 'email',
                isVerified: false,
                expiresAt: MoreThan(new Date()),
            },
            order: { createdAt: "DESC" },
        });
        if (emailOtp) {
            if (emailOtp.code === code) {
                emailOtp.isVerified = true;
                await this.otpRepository.save(emailOtp);
                log.info("Email OTP verified successfully");
                authEventsTotal.inc({ event: "otp_verified", channel: "email" });
                return true;
            }
            log.warn("Email OTP verification failed - invalid code");
            authEventsTotal.inc({ event: "otp_failed", channel: "email" });
            return false;
        }

        // ── Prelude SMS/WhatsApp verification: DISABLED (email OTP only). Kept for easy re-enable. ──
        // const isVerifiedByPrelude = await this.preludeService.checkVerification(phoneNumber, code);
        // if (!isVerifiedByPrelude) { ... return false; }
        // (mark local record verified) ... return true;

        // No valid (unexpired, unverified) email OTP matched this code.
        log.warn("OTP verification failed - no valid code on file");
        authEventsTotal.inc({ event: "otp_failed", channel: "email" });
        return false;
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
