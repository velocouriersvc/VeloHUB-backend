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

        // Email channel: generate the code locally and deliver it via SMTP (EmailService).
        // Cheaper than SMS and offered as an alternative verification method.
        if (channel === 'email') {
            if (!email) {
                throw new Error("Email address is required to send an email verification code.");
            }
            const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
            const expiresAt = new Date(Date.now() + 10 * 60000); // 10 mins

            await this.otpRepository.delete({ phoneNumber });
            const otp = this.otpRepository.create({ phoneNumber, code, expiresAt, channel });
            await this.otpRepository.save(otp);

            const sent = await EmailService.sendOtp(email, code);
            if (!sent) {
                throw new Error("Failed to send the email verification code. Please try again.");
            }
            log.info("Email OTP sent successfully");
            return "email-otp";
        }

        // Trigger Prelude's verification - they handle code generation and channel selection (SMS/WhatsApp)
        const verificationId = await this.preludeService.sendVerification(phoneNumber);
        // Optional: still store metadata in the DB for audit/history
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

        // Otherwise verification is handled by Prelude (SMS / WhatsApp).
        const isVerifiedByPrelude = await this.preludeService.checkVerification(phoneNumber, code);

        if (!isVerifiedByPrelude) {
            log.warn("OTP verification failed via Prelude - invalid or expired code");
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
