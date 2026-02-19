import { AppDataSource } from "../db/data-source";
import { User, UserStatus } from "../models/user";
import { OtpService } from "./otp-service";
import { supabase } from "../utils/supabase-client";
import { Profile } from "../types/profile";
import { TwilioService } from "./twilio-service";

export class AuthService {
    private userRepository = AppDataSource.getRepository(User);
    private otpService = new OtpService();
    private twilioService = new TwilioService();

    private async getProfileByPhone(phoneNumber: string): Promise<Profile> {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('phone_number', phoneNumber)
            .single();

        if (error || !profile) {
            console.error(`[AUTH SERVICE] Profile not found for ${phoneNumber}:`, error);
            throw new Error("Phone number not registered or profile not found.");
        }

        return profile as Profile;
    }

    async requestOtp(phoneNumber: string): Promise<void> {
        // 1. Check if phone number exists in Supabase profiles
        await this.getProfileByPhone(phoneNumber);

        // 2. Generate OTP
        const code = await this.otpService.createOtp(phoneNumber);

        // 3. Send SMS via Twilio
        try {
            await this.twilioService.sendSMS(phoneNumber, `Your Velo Hub verification code is: ${code}`);
            console.log(`[AUTH SERVICE] OTP sent successfully to ${phoneNumber}`);
        } catch (twilioError) {
            console.error(`[AUTH SERVICE] Failed to send OTP to ${phoneNumber}:`, twilioError);
            throw new Error("Failed to send verification code. Please try again later.");
        }
    }

    async verifyOtp(phoneNumber: string, code: string): Promise<{ token: string; user: any; isNewUser: boolean } | null> {
        // 1. Check profile existence
        await this.getProfileByPhone(phoneNumber);

        const isValid = await this.otpService.verifyOtp(phoneNumber, code);

        if (!isValid) {
            return null;
        }

        let user = await this.userRepository.findOne({
            where: { phoneNumber },
            relations: ["userRoles", "userRoles.role"]
        });

        let isNewUser = false;

        if (!user) {
            user = this.userRepository.create({
                phoneNumber,
                status: UserStatus.ACTIVE,
            });
            await this.userRepository.save(user);
            isNewUser = true;
        }

        user.lastLoginAt = new Date();
        await this.userRepository.save(user);

        // Cleanup verified OTPs in the background
        this.otpService.cleanup().catch((err: Error) => console.error("OTP Cleanup Error:", err));

        return {
            token: "mock-jwt-token",
            user: {
                id: user.id,
                roles: user.userRoles?.map((ur: any) => ur.role.name) || [],
            },
            isNewUser,
        };
    }
    async syncUser(supabaseUser: any): Promise<any> {
        const { id, email, phone } = supabaseUser;

        let user = await this.userRepository.findOne({
            where: { id },
            relations: ["userRoles", "userRoles.role"]
        });

        const isNewUser = !user;

        if (!user) {
            user = this.userRepository.create({
                id,
                email,
                phoneNumber: phone,
                status: UserStatus.ACTIVE,
                // isActive: true, // Removed as it's not in the entity?
                // userType: "buyer", // Removed as it's not in the entity?
            });
            await this.userRepository.save(user);
        } else {
            user.lastLoginAt = new Date();
            await this.userRepository.save(user);
        }

        return {
            user: {
                id: user.id,
                email: user.email,
                phoneNumber: user.phoneNumber,
                status: user.status,
                roles: user.userRoles?.map((ur: any) => ur.role.name) || [],
            },
            isNewUser
        };
    }
}
