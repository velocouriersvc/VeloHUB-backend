import { AppDataSource } from "../db/data-source";
import crypto from "crypto";
import axios from "axios";
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
import { UserProfile } from "../models/user-profile";
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

    private async verifyAppleToken(identityToken: string): Promise<{ sub: string; email?: string }> {
        const parts = identityToken.split('.');
        if (parts.length !== 3) throw new Error('Invalid token format');

        const [headerB64, payloadB64, signatureB64] = parts;
        const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

        const now = Math.floor(Date.now() / 1000);
        if (payload.iss !== 'https://appleid.apple.com') throw new Error('Invalid issuer');
        // Accept both bundle IDs (iOS and potential future variants)
        const bundleId = process.env.APPLE_BUNDLE_ID || 'com.velo.marketplace';
        if (payload.aud !== bundleId) throw new Error(`Invalid audience: ${payload.aud}`);
        if (payload.exp < now) throw new Error('Token expired');

        const { data } = await axios.get<{ keys: Array<{ kid: string; kty: string; n: string; e: string }> }>(
            'https://appleid.apple.com/auth/keys',
            { timeout: 5000 }
        );
        const jwk = data.keys.find(k => k.kid === header.kid);
        if (!jwk) throw new Error('No matching Apple public key found');

        const publicKey = crypto.createPublicKey({ key: jwk as any, format: 'jwk' });
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(`${headerB64}.${payloadB64}`);
        const valid = verifier.verify(publicKey, Buffer.from(signatureB64, 'base64url'));
        if (!valid) throw new Error('Token signature invalid');

        return { sub: payload.sub as string, email: payload.email as string | undefined };
    }

    async appleSignIn(identityToken: string, fullName?: string, email?: string): Promise<any> {
        const { sub: appleSubjectId, email: tokenEmail } = await this.verifyAppleToken(identityToken);
        const resolvedEmail = tokenEmail || email || null;

        // Find existing user by Apple subject ID first, then by email
        let user = await this.userRepository.findOne({
            where: { appleSubjectId },
            relations: ["userRoles", "userRoles.role"]
        });

        if (!user && resolvedEmail) {
            user = await this.userRepository.findOne({
                where: { email: resolvedEmail },
                relations: ["userRoles", "userRoles.role"]
            });
            if (user && !user.appleSubjectId) {
                user.appleSubjectId = appleSubjectId;
                await this.userRepository.save(user);
            }
        }

        const isNewUser = !user;

        if (!user) {
            user = this.userRepository.create({
                id: crypto.randomUUID(),
                email: resolvedEmail,
                appleSubjectId,
                status: UserStatus.ACTIVE,
            });
            await this.userRepository.save(user);
            log.info("New Apple Sign-In user created", { userId: user.id });
        }

        user.lastLoginAt = new Date();
        await this.userRepository.save(user);

        // Store full name in UserProfile if provided on first sign-in
        if (fullName && isNewUser) {
            const userProfileRepo = AppDataSource.getRepository(UserProfile);
            const existing = await userProfileRepo.findOne({ where: { userId: user.id } });
            if (!existing) {
                await userProfileRepo.save(userProfileRepo.create({ userId: user.id, fullName }));
            }
        }

        if (!user.userRoles?.length) {
            await this.ensureBuyerRoleExists(user);
            user = await this.userRepository.findOne({
                where: { id: user.id },
                relations: ["userRoles", "userRoles.role"]
            }) as User;
        }

        const approvedRoles = user.userRoles
            ?.filter((ur: UserRole) => ur.status === RoleStatus.APPROVED)
            .map((ur: UserRole) => ur.role.name) || [];

        // Resolve display name
        let displayName: string | null = fullName || null;
        let hasProfile = false;
        const userProfile = await AppDataSource.getRepository(UserProfile).findOne({ where: { userId: user.id } });
        if (userProfile?.fullName) { displayName = userProfile.fullName; hasProfile = true; }
        if (!displayName) {
            const buyerProfile = await AppDataSource.getRepository(BuyerProfile).findOne({ where: { userId: user.id } });
            if (buyerProfile?.fullName) { displayName = buyerProfile.fullName; hasProfile = true; }
        }

        return {
            message: isNewUser ? 'Account created' : 'Signed in',
            user: {
                id: user.id,
                phoneNumber: user.phoneNumber,
                email: user.email,
                is_new_user: isNewUser,
                has_profile: hasProfile,
                roles: approvedRoles,
                activeRole: user.activeRole || null,
                full_name: displayName,
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
