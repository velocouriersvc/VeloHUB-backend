import { AppDataSource } from "../db/data-source";
import { BuyerProfile } from "../models/buyer-profile";
import { DriverProfile, DriverVerificationStatus } from "../models/driver-profile";
import { MerchantProfile, MerchantVerificationStatus } from "../models/merchant-profile";
import { Identification, IdentificationStatus } from "../models/identification";
import { supabase, supabaseAdmin } from "../utils/supabase-client";
import { RoleType } from "../models/role";
import { User, UserStatus } from "../models/user";
import { UserRole, RoleStatus } from "../models/user-role";
import { Role } from "../models/role";
import { BuyerSetupPayload, DriverSetupPayload, MerchantSetupPayload } from "../types/profile";

export class ProfileService {
    private userRepository = AppDataSource.getRepository(User);
    private roleRepository = AppDataSource.getRepository(Role);

    private async syncToSupabase(userId: string, data: any) {
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
            console.error(`[PROFILE SERVICE] Supabase sync failed for ${userId}:`, error);
            throw error;
        }
    }

    async setupBuyerProfile(userId: string, data: BuyerSetupPayload) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            let profile = await queryRunner.manager.findOne(BuyerProfile, { where: { userId } });
            if (profile) {
                queryRunner.manager.merge(BuyerProfile, profile, data);
            } else {
                profile = queryRunner.manager.create(BuyerProfile, { userId, ...data });
            }
            const savedProfile = await queryRunner.manager.save(profile);

            await this.ensureRole(queryRunner, userId, RoleType.BUYER);

            const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
            // await this.syncToSupabase(userId, {
            //     full_name: data.fullName,
            //     email: data.email,
            //     phone_number: user?.phoneNumber
            // });

            await queryRunner.commitTransaction();
            return savedProfile;
        } catch (error) {
            await queryRunner.rollbackTransaction();
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
            const identification = queryRunner.manager.create(Identification, {
                type: 'Ghana Card',
                idNumber: data.idNumber,
                issuingCountry: 'GHA',
                frontUrl: data.idImageUrl,
                status: IdentificationStatus.PENDING
            });
            const savedId = await queryRunner.manager.save(identification);

            let profile = await queryRunner.manager.findOne(DriverProfile, { where: { userId } });
            const profileData = {
                userId,
                fullName: data.fullName,
                licenseNumber: data.licenseNumber,
                licensePhotoUrl: data.licensePhotoUrl,
                vehicleType: data.vehicleType,
                plateNumber: data.plateNumber,
                identificationId: savedId.id,
                status: DriverVerificationStatus.PENDING
            };

            if (profile) {
                queryRunner.manager.merge(DriverProfile, profile, profileData);
            } else {
                profile = queryRunner.manager.create(DriverProfile, profileData);
            }
            const savedProfile = await queryRunner.manager.save(profile);

            await this.ensureRole(queryRunner, userId, RoleType.DRIVER);

            const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
            // await this.syncToSupabase(userId, {
            //     full_name: data.fullName,
            //     phone_number: user?.phoneNumber
            // });

            await queryRunner.commitTransaction();
            return savedProfile;
        } catch (error) {
            await queryRunner.rollbackTransaction();
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
            const identification = queryRunner.manager.create(Identification, {
                type: 'Ghana Card',
                idNumber: data.idNumber,
                issuingCountry: 'GHA',
                frontUrl: data.idImageUrl,
                status: IdentificationStatus.PENDING
            });
            const savedId = await queryRunner.manager.save(identification);

            let profile = await queryRunner.manager.findOne(MerchantProfile, { where: { userId } });
            const profileData = {
                userId,
                businessName: data.businessName,
                category: data.category,
                businessEmail: data.businessEmail,
                businessPhone: data.businessPhone,
                address: data.address,
                latitude: data.latitude,
                longitude: data.longitude,
                registrationDocUrl: data.registrationDocUrl,
                identificationId: savedId.id,
                status: MerchantVerificationStatus.PENDING
            };

            if (profile) {
                queryRunner.manager.merge(MerchantProfile, profile, profileData);
            } else {
                profile = queryRunner.manager.create(MerchantProfile, profileData);
            }
            const savedProfile = await queryRunner.manager.save(profile);

            await this.ensureRole(queryRunner, userId, RoleType.MERCHANT);

            const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
            // await this.syncToSupabase(userId, {
            //     full_name: data.businessName,
            //     phone_number: user?.phoneNumber
            // });

            await queryRunner.commitTransaction();
            return savedProfile;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    private async ensureRole(queryRunner: any, userId: string, roleName: RoleType) {
        const role = await queryRunner.manager.findOne(Role, { where: { name: roleName } });
        if (role) {
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
    }
}
