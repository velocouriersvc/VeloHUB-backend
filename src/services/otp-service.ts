import { AppDataSource } from "../db/data-source";
import { Otp } from "../models/otp";
import { TwilioService } from "./twilio-service";
import { MoreThan } from "typeorm";

export class OtpService {
    private otpRepository = AppDataSource.getRepository(Otp);

    async createOtp(phoneNumber: string): Promise<string> {
        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

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
        } catch (error) {
            console.error("Failed to send OTP SMS:", error);
            // We might want to throw here or handle it gracefully depending on requirements
            // For now, logging it is sufficient as the code is returned
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
            return false;
        }

        // Mark as verified instead of immediate deletion to allow for potential audit
        otp.isVerified = true;
        await this.otpRepository.save(otp);

        return true;
    }

    async cleanup(): Promise<void> {
        // Delete expired or verified OTPs
        await this.otpRepository.createQueryBuilder()
            .delete()
            .where("expiresAt < :now", { now: new Date() })
            .orWhere("isVerified = :verified", { verified: true })
            .execute();
    }
}
