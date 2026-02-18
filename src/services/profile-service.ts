import { AppDataSource } from "../db/data-source";
import { BuyerProfile } from "../models/buyer-profile";
import { DriverProfile } from "../models/driver-profile";
import { MerchantProfile } from "../models/merchant-profile";

export class ProfileService {
    private buyerRepository = AppDataSource.getRepository(BuyerProfile);
    private driverRepository = AppDataSource.getRepository(DriverProfile);
    private merchantRepository = AppDataSource.getRepository(MerchantProfile);

    async saveBuyerProfile(data: any) {
        const { userId, ...rest } = data;
        let profile = await this.buyerRepository.findOne({ where: { userId } });

        if (profile) {
            this.buyerRepository.merge(profile, rest);
        } else {
            profile = this.buyerRepository.create(data as BuyerProfile);
        }

        return await this.buyerRepository.save(profile);
    }

    async saveDriverProfile(data: any) {
        const { userId, ...rest } = data;
        let profile = await this.driverRepository.findOne({ where: { userId } });

        if (profile) {
            this.driverRepository.merge(profile, rest);
        } else {
            profile = this.driverRepository.create(data as DriverProfile);
        }

        return await this.driverRepository.save(profile);
    }

    async saveMerchantProfile(data: any) {
        const { userId, ...rest } = data;
        let profile = await this.merchantRepository.findOne({ where: { userId } });

        if (profile) {
            this.merchantRepository.merge(profile, rest);
        } else {
            profile = this.merchantRepository.create(data as MerchantProfile);
        }

        return await this.merchantRepository.save(profile);
    }
}
