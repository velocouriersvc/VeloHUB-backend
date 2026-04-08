import { AppDataSource, } from "../db/data-source";
import { QueryRunner } from "typeorm";
import { BuyerProfile } from "../models/buyer-profile";
import { DriverProfile, DriverVerificationStatus } from "../models/driver-profile";
import { MerchantProfile, MerchantVerificationStatus } from "../models/merchant-profile";
import { Identification, IdentificationStatus } from "../models/identification";
import { supabase, supabaseAdmin } from "../utils/supabase-client";
import { Role, RoleType } from "../models/role";
import { User, UserStatus } from "../models/user";
import { UserRole, RoleStatus } from "../models/user-role";
import { BuyerSetupPayload, DriverSetupPayload, MerchantSetupPayload } from "../types/profile";
import { createServiceLogger } from "../utils/logger";
import { UserProfile } from "../models/user-profile";
import { rewriteToPublicAssetUrl } from "./upload-service";

const log = createServiceLogger("ProfileService");

export class ProfileService {
    private userRepository = AppDataSource.getRepository(User);
    private roleRepository = AppDataSource.getRepository(Role);
    private userProfileRepository = AppDataSource.getRepository(UserProfile);

    private async syncToSupabase(userId: string, data: Record<string, unknown>) {
        try {
            const { error } = await supabaseAdmin
                .from('profiles')
                .upsert({
                    id: userId,
                    ...data,
                    updated_at: new Date()
                });
            if (error) throw error;
        } catch (error) {
            log.error("Supabase sync failed", { userId, error: (error as Error).message });
            throw error;
        }
    }

    async setupBuyerProfile(userId: string, data: BuyerSetupPayload) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 1. Update User level info (email, country)
            const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
            if (user) {
                user.email = data.email || user.email;
                user.country = data.country_code || user.country;
                await queryRunner.manager.save(User, user);
            }

            // 2. Handle Identification if Ghana Card is provided
            let idRecord: Identification | null = null;
            if (data.ghana_card_number) {
                idRecord = await queryRunner.manager.findOne(Identification, { where: { idNumber: data.ghana_card_number } });
                if (!idRecord) {
                    idRecord = queryRunner.manager.create(Identification, {
                        type: 'Ghana Card',
                        idNumber: data.ghana_card_number,
                        issuingCountry: data.country_code || 'GH',
                        frontUrl: 'onboarding-manual', // Manual entry
                        status: IdentificationStatus.PENDING
                    });
                }
                idRecord = await queryRunner.manager.save(Identification, idRecord);
            }

            // 3. Create or Update Profile
            let profile = await queryRunner.manager.findOne(BuyerProfile, { where: { userId } });
            const profileData = {
                userId,
                fullName: data.full_name,
                region: data.location,
                identificationId: idRecord?.id || null
            };

            if (profile) {
                queryRunner.manager.merge(BuyerProfile, profile, profileData);
            } else {
                profile = queryRunner.manager.create(BuyerProfile, profileData);
            }
            const savedProfile = await queryRunner.manager.save(BuyerProfile, profile);

            await this.ensureRole(queryRunner, userId, RoleType.BUYER);

            await queryRunner.commitTransaction();
            log.info("Buyer profile setup completed", { userId });
            return savedProfile;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            log.error("Buyer profile setup failed", { userId, error: (error as Error).message });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async setupDriverProfile(userId: string, data: DriverSetupPayload) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 1. Update User level info (email, country)
            const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
            if (user) {
                user.email = data.email || user.email;
                user.country = data.country_code || user.country;
                await queryRunner.manager.save(User, user);
            }

            // 2. Handle Identification (Ghana Card)
            let idRecord: Identification | null = null;
            if (data.ghana_card_number) {
                 idRecord = await queryRunner.manager.findOne(Identification, { where: { idNumber: data.ghana_card_number } });
                 if (!idRecord) {
                    idRecord = queryRunner.manager.create(Identification, {
                        type: 'Ghana Card',
                        idNumber: data.ghana_card_number,
                        issuingCountry: data.country_code || 'GH',
                        frontUrl: data.ghana_card_front_url || 'pending',
                        backUrl: data.ghana_card_back_url || null,
                        status: IdentificationStatus.PENDING
                    });
                }
                idRecord = await queryRunner.manager.save(Identification, idRecord);
            }

            // 3. Create or Update Driver Profile
            let profile = await queryRunner.manager.findOne(DriverProfile, { where: { userId } });
            const profileData = {
                userId,
                fullName: data.full_name,
                licenseNumber: data.license_number,
                // If licensePhotoUrl was passed before... the frontend snippet doesn't have it explicitly as 'license_photo', 
                // but for now, let's keep what we have.
                vehicleType: data.vehicle_type,
                plateNumber: data.vehicle_number,
                vehicleModel: data.vehicle_model || null,
                vehicleColor: data.vehicle_color || null,
                region: data.location,
                identificationId: idRecord?.id || null,
                status: DriverVerificationStatus.PENDING
            };

            if (profile) {
                queryRunner.manager.merge(DriverProfile, profile, profileData);
            } else {
                profile = queryRunner.manager.create(DriverProfile, profileData);
            }
            const savedProfile = await queryRunner.manager.save(DriverProfile, profile);

            await this.ensureRole(queryRunner, userId, RoleType.DRIVER);

            await queryRunner.commitTransaction();
            log.info("Driver profile setup completed", { userId });
            return savedProfile;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            log.error("Driver profile setup failed", { userId, error: (error as Error).message });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async setupMerchantProfile(userId: string, data: MerchantSetupPayload) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 1. Update User level info (country)
            const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
            if (user) {
                user.country = data.country_code || user.country;
                await queryRunner.manager.save(User, user);
            }

            // 2. Handle Identification (Ghana Card)
            let idRecord: Identification | null = null;
            if (data.ghana_card_number) {
                 idRecord = await queryRunner.manager.findOne(Identification, { where: { idNumber: data.ghana_card_number } });
                 if (!idRecord) {
                    idRecord = queryRunner.manager.create(Identification, {
                        type: 'Ghana Card',
                        idNumber: data.ghana_card_number,
                        issuingCountry: data.country_code || 'GH',
                        frontUrl: data.ghana_card_front_url || 'pending',
                        backUrl: data.ghana_card_back_url || null,
                        status: IdentificationStatus.PENDING
                    });
                }
                idRecord = await queryRunner.manager.save(Identification, idRecord);
            }

            // 3. Create or Update Merchant Profile
            let profile = await queryRunner.manager.findOne(MerchantProfile, { where: { userId } });
            const profileData = {
                userId,
                businessName: data.business_name,
                category: data.business_type,
                businessEmail: data.business_email,
                businessPhone: data.phone,
                address: data.business_address,
                region: data.location,
                latitude: data.latitude || null,
                longitude: data.longitude || null,
                identificationId: idRecord?.id || null,
                status: MerchantVerificationStatus.PENDING
            };

            if (profile) {
                queryRunner.manager.merge(MerchantProfile, profile, profileData);
            } else {
                profile = queryRunner.manager.create(MerchantProfile, profileData);
            }
            const savedProfile = await queryRunner.manager.save(MerchantProfile, profile);

            await this.ensureRole(queryRunner, userId, RoleType.MERCHANT);

            await queryRunner.commitTransaction();
            log.info("Merchant profile setup completed", { userId });
            return savedProfile;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            log.error("Merchant profile setup failed", { userId, error: (error as Error).message });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    private async ensureRole(queryRunner: QueryRunner, userId: string, roleName: RoleType) {
        let role = await queryRunner.manager.findOne(Role, { where: { name: roleName } });
        if (!role) {
            role = queryRunner.manager.create(Role, {
                name: roleName,
                description: `${roleName} role`
            });
            await queryRunner.manager.save(role);
        }

        const existingUserRole = await queryRunner.manager.findOne(UserRole, {
            where: { userId, roleId: role.id }
        });
        if (!existingUserRole) {
            const userRole = queryRunner.manager.create(UserRole, {
                userId,
                roleId: role.id,
                status: (roleName === RoleType.BUYER) ? RoleStatus.APPROVED : RoleStatus.PENDING
            });
            await queryRunner.manager.save(userRole);
        }
    }

    async getUserProfile(userId: string) {
        const user = await this.userRepository.findOne({
            where: { id: userId },
            relations: ["userRoles", "userRoles.role"],
        });

        if (!user) {
            throw new Error("User not found");
        }

        let userProfile = await this.userProfileRepository.findOne({ where: { userId } });
        if (!userProfile) {
            userProfile = this.userProfileRepository.create({ userId });
            userProfile = await this.userProfileRepository.save(userProfile);
        }

        let resolvedFullName = userProfile.fullName;
        if (!resolvedFullName) {
            const buyerProfile = await AppDataSource.getRepository(BuyerProfile).findOne({ where: { userId } });
            if (buyerProfile?.fullName) {
                resolvedFullName = buyerProfile.fullName;
            } else {
                const driverProfile = await AppDataSource.getRepository(DriverProfile).findOne({ where: { userId } });
                if (driverProfile?.fullName) {
                    resolvedFullName = driverProfile.fullName;
                } else {
                    const merchantProfile = await AppDataSource.getRepository(MerchantProfile).findOne({ where: { userId } });
                    if (merchantProfile?.businessName) {
                        resolvedFullName = merchantProfile.businessName;
                    }
                }
            }
        }

        const roleDetails = (user.userRoles || []).map((userRole) => ({
            name: userRole.role?.name,
            status: userRole.status,
            assignedAt: userRole.assignedAt,
        }));

        return {
            id: user.id,
            phoneNumber: user.phoneNumber,
            email: user.email,
            status: user.status,
            activeRole: user.activeRole,
            fullName: resolvedFullName,
            profileImageUrl: rewriteToPublicAssetUrl(userProfile.profileImageUrl),
            roles: roleDetails,
        };
    }

    async updateUserProfile(userId: string, payload: { fullName?: string; profileImageUrl?: string | null }) {
        let userProfile = await this.userProfileRepository.findOne({ where: { userId } });
        if (!userProfile) {
            userProfile = this.userProfileRepository.create({ userId });
        }

        if (payload.fullName !== undefined) {
            userProfile.fullName = payload.fullName.trim() || null;
        }

        if (payload.profileImageUrl !== undefined) {
            userProfile.profileImageUrl = payload.profileImageUrl || null;
        }

        await this.userProfileRepository.save(userProfile);
        return this.getUserProfile(userId);
    }
}
