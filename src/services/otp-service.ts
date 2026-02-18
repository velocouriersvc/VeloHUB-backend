import { AppDataSource } from "../db/data-source.js";
import { Otp } from "../models/otp.js";
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

        // In a real scenario, this is where Twilio would be called to send the SMS
        // For now, we return the code to the caller (who will handle sending via Twilio)
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
