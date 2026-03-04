import {AppDataSource} from "../data-source";
import {CountryPolicy} from "../entities/country-policy";

export const countryPolicyService = {
    async getAllCountryPolicies() {
        return AppDataSource.getRepository(CountryPolicy).find();
    },
    async getCountryPolicyById(id: string) {
        return AppDataSource.getRepository(CountryPolicy).findOneBy({id});
    },
    async createCountryPolicy(countryPolicy: CountryPolicy) {
        return AppDataSource.getRepository(CountryPolicy).save(countryPolicy);
    },
    async updateCountryPolicy(id: string, countryPolicy: CountryPolicy) {
        return AppDataSource.getRepository(CountryPolicy).update(id, countryPolicy);
    },
    async deleteCountryPolicy(id: string) {
        return AppDataSource.getRepository(CountryPolicy).delete(id);
    }
}