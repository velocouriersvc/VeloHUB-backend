import { AppDataSource } from "../db/data-source";
import crypto from "crypto";
import { User, UserStatus } from "../models/user";
import { OtpService } from "./otp-service";
import { supabase } from "../utils/supabase-client";
import { Profile } from "../types/profile";
import { AuthResponse, AuthUserResponse, SupabaseUser, SyncUserResponse } from "../types/auth";
import { TwilioService } from "./twilio-service";
import { Role, RoleType } from "../models/role";
import { UserRole, RoleStatus } from "../models/user-role";

export class AuthService {
    private userRepository = AppDataSource.getRepository(User);
    private roleRepository = AppDataSource.getRepository(Role);
    private userRoleRepository = AppDataSource.getRepository(UserRole);
    private otpService = new OtpService();
    private twilioService = new TwilioService();

    private async getProfileByPhone(phoneNumber: string): Promise<Profile | null> {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('phone_number', phoneNumber)
            .single();

        if (error || !profile) {
            return null;
        }

        return profile as Profile;
    }

    async requestOtp(phoneNumber: string): Promise<void> {
        // 1. Check if phone number exists in Supabase profiles (to determine if new user later)
        // Note: Spec says to just send OTP here.

        // 2. Send Verification via Twilio Verify
        try {
            await this.twilioService.sendVerification(phoneNumber);
            console.log(`[AUTH SERVICE] Verification sent successfully to ${phoneNumber}`);
        } catch (error) {
            console.error(`[AUTH SERVICE] Failed to send verification to ${phoneNumber}:`, error);
            throw new Error("Failed to send verification code. Please try again later.");
        }
    }

    async verifyOtp(phoneNumber: string, code: string): Promise<AuthResponse | null> {
        // 1. Check verification with Twilio Verify
        const isApproved = await this.twilioService.checkVerification(phoneNumber, code);

        if (!isApproved) {
            return null;
        }

        // 2. Check if user exists in local DB and Supabase
        const profile = await this.getProfileByPhone(phoneNumber);
        const isNewUser = !profile;

        let user = await this.userRepository.findOne({
            where: { phoneNumber },
            relations: ["userRoles", "userRoles.role"]
        });

        if (!user) {
            // If they have a profile in Supabase but not in local DB, they might be "known" but not "synced"
            // However, usually we create the user record upon verification if it doesn't exist.
            user = this.userRepository.create({
                id: profile?.id || crypto.randomUUID(), // Fallback to new UUID if truly new
                phoneNumber,
                status: UserStatus.ACTIVE,
            });
            await this.userRepository.save(user);

        }

        user.lastLoginAt = new Date();
        await this.userRepository.save(user);

        return {
            token: "mock-jwt-token",
            user: {
                id: user.id,
                is_new_user: isNewUser,
                roles: user.userRoles?.map((ur: any) => ur.role.name) || [],
            }
        };
    }

    async syncUser(supabaseUser: SupabaseUser): Promise<SyncUserResponse> {
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
                email: user.email || undefined,
                phoneNumber: user.phoneNumber || undefined,
                status: user.status,
                roles: user.userRoles?.map((ur: any) => ur.role.name) || [],
            },
            isNewUser
        };
    }
}
