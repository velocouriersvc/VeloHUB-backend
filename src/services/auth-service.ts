import { AppDataSource } from "../db/data-source";
import { User, UserStatus } from "../models/user";
import { OtpService } from "./otp-service";

export class AuthService {
    private userRepository = AppDataSource.getRepository(User);
    private otpService = new OtpService();

    async requestOtp(phoneNumber: string): Promise<void> {
        const code = await this.otpService.createOtp(phoneNumber);

        // TODO: Actually call Twilio SMS Service here
        console.log(`[AUTH SERVICE] Sending code ${code} to ${phoneNumber} via Twilio`);
    }

    async verifyOtp(phoneNumber: string, code: string): Promise<{ token: string; user: any; isNewUser: boolean } | null> {
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
        this.otpService.cleanup().catch(err => console.error("OTP Cleanup Error:", err));

        return {
            token: "mock-jwt-token",
            user: {
                id: user.id,
                roles: user.userRoles?.map(ur => ur.role.name) || [],
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
                roles: user.userRoles?.map(ur => ur.role.name) || [],
            },
            isNewUser
        };
    }
}
