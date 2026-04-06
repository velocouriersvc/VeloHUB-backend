import { AppDataSource } from "../db/data-source";
import crypto from "crypto";
import { User, UserStatus } from "../models/user";
import { OtpService } from "./otp-service";
import { supabase } from "../utils/supabase-client";
import { Profile } from "../types/profile";
import { AuthResponse, AuthUserResponse, SupabaseUser, SyncUserResponse } from "../types/auth";
import { Role, RoleType } from "../models/role";
import { UserRole, RoleStatus } from "../models/user-role";
import { BuyerProfile } from "../models/buyer-profile";
import { DriverProfile } from "../models/driver-profile";
import { MerchantProfile } from "../models/merchant-profile";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("AuthService");

export class AuthService {
    private userRepository = AppDataSource.getRepository(User);
    private roleRepository = AppDataSource.getRepository(Role);
    private userRoleRepository = AppDataSource.getRepository(UserRole);
    private otpService = new OtpService();

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

    async requestOtp(phoneNumber: string, channel: 'sms' | 'whatsapp' = 'sms'): Promise<void> {
        // 1. Generate and Send OTP via OtpService (Local DB + Twilio SMS)
        try {
            await this.otpService.createOtp(phoneNumber, channel);
            log.info("OTP request initiated", { channel });
        } catch (error) {
            log.error("Failed to request OTP", { error: (error as Error).message });
            throw new Error(`Failed to send verification code via ${channel}. Please try again later.`);
        }
    }

    private async ensureBuyerRoleExists(user: User) {
        await AppDataSource.transaction(async manager => {
            let buyerRole = await manager.findOne(Role, { where: { name: RoleType.BUYER } });
            if (!buyerRole) {
                buyerRole = manager.create(Role, {
                    name: RoleType.BUYER,
                    description: "Standard buyer role"
                });
                await manager.save(buyerRole);
            }

            const existingUserRole = await manager.findOne(UserRole, {
                where: { userId: user.id, roleId: buyerRole.id }
            });

            if (!existingUserRole) {
                const userRole = manager.create(UserRole, {
                    userId: user.id,
                    roleId: buyerRole.id,
                    status: RoleStatus.APPROVED
                });
                await manager.save(userRole);
            }

            const persistedUser = await manager.findOne(User, { where: { id: user.id } });
            if (persistedUser && !persistedUser.activeRole) {
                persistedUser.activeRole = RoleType.BUYER;
                await manager.save(persistedUser);
            }
        });
    }

    async verifyOtp(phoneNumber: string, code: string): Promise<AuthResponse | null> {
        // 1. Check verification with OtpService (Local DB)
        const isApproved = await this.otpService.verifyOtp(phoneNumber, code);

        if (!isApproved) {
            return null;
        }

        // 2. Check if user exists in local DB
        let user = await this.userRepository.findOne({
            where: { phoneNumber },
            relations: ["userRoles", "userRoles.role"]
        });

        const isNewUser = !user;

        if (!user) {
            user = this.userRepository.create({
                id: crypto.randomUUID(),
                phoneNumber,
                status: UserStatus.ACTIVE,
            });
            await this.userRepository.save(user);
            log.info("New user created", { userId: user.id });
        }

        user.lastLoginAt = new Date();
        await this.userRepository.save(user);

        if (!user.userRoles?.length) {
            await this.ensureBuyerRoleExists(user);
            user = await this.userRepository.findOne({
                where: { id: user.id },
                relations: ["userRoles", "userRoles.role"]
            }) as User;
        }

        const approvedRoles = user.userRoles?.filter((ur: UserRole) => ur.status === RoleStatus.APPROVED).map((ur: UserRole) => ur.role.name) || [];

        // Resolve display name and profile existence
        let fullName: string | null = null;
        let hasProfile = false;
        const buyerProfile = await AppDataSource.getRepository(BuyerProfile).findOne({ where: { userId: user.id } });
        if (buyerProfile?.fullName) {
            fullName = buyerProfile.fullName;
            hasProfile = true;
        } else {
            const driverProfile = await AppDataSource.getRepository(DriverProfile).findOne({ where: { userId: user.id } });
            if (driverProfile?.fullName) {
                fullName = driverProfile.fullName;
                hasProfile = true;
            } else {
                const merchantProfile = await AppDataSource.getRepository(MerchantProfile).findOne({ where: { userId: user.id } });
                if (merchantProfile?.businessName) {
                    fullName = merchantProfile.businessName;
                    hasProfile = true;
                }
            }
        }

        log.info("User login successful", { userId: user.id, isNewUser, hasProfile });

        return {
            user: {
                id: user.id,
                is_new_user: isNewUser,
                roles: approvedRoles,
                activeRole: user.activeRole || null,
                full_name: fullName || null,
                has_profile: hasProfile,
            }
        } as any;
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
                email: email || null,
                phoneNumber: phone || null,
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
                roles: user.userRoles?.filter((ur: UserRole) => ur.status === RoleStatus.APPROVED).map((ur: UserRole) => ur.role.name) || [],
            },
            isNewUser
        };
    }
}
