import { Request, Response } from "express";
import { AuthService } from "../services/auth-service";
import { RequestOtpPayload, VerifyOtpPayload, AuthenticatedRequest } from "../types/auth";
import { AppDataSource } from "../db/data-source";
import { User } from "../models/user";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("AuthController");

export class AuthController {
    private authService = new AuthService();

    requestOTP = async (req: Request, res: Response) => {
        try {
            const { phoneNumber, channel = 'sms' } = req.body as RequestOtpPayload;
 
             if (!phoneNumber) {
                 return res.status(400).json({ message: "Phone number is required" });
             }
 
            await this.authService.requestOtp(phoneNumber, channel);

            return res.status(200).json({
                message: "OTP sent successfully"
            });
        } catch (error) {
            log.error("Error requesting OTP", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    verifyOTP = async (req: Request, res: Response) => {
        try {
            const { phoneNumber, code } = req.body as VerifyOtpPayload;

            if (!phoneNumber || !code) {
                return res.status(400).json({ message: "Phone number and code are required" });
            }

            const result = await this.authService.verifyOtp(phoneNumber, code);

            if (!result) {
                return res.status(401).json({ message: "Invalid or expired OTP" });
            }

            return res.status(200).json(result);
        } catch (error) {
            log.error("Error verifying OTP", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };


    syncUser = async (req: Request, res: Response) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const supabaseUser = authReq.user;

            if (!supabaseUser) {
                return res.status(401).json({ message: "User not authenticated" });
            }

            const result = await this.authService.syncUser(supabaseUser);

            return res.status(200).json(result);
        } catch (error) {
            console.error("Error syncing user:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    getMe = async (req: Request, res: Response) => {
        try {
            const userRef = (req as any).user;

            // Guest bypass for test phone numbers
            const guestNumbers = ["+233000000000", "+233000000001"];
            if (userRef && guestNumbers.includes(userRef.phoneNumber)) {
                return res.status(200).json({
                    id: userRef.phoneNumber === "+233000000000" ? "guest-id-0" : "guest-id-1",
                    phoneNumber: userRef.phoneNumber,
                    email: userRef.phoneNumber === "+233000000000" ? "guest@velohub.dev" : "admin2@velohub.dev",
                    status: "active",
                    roles: [{ name: "super_admin", allowedCountries: [], allowedCities: [] },
                            { name: "admin", allowedCountries: [], allowedCities: [] }],
                    full_name: "Guest Admin",
                    created_date: new Date()
                });
            }

            if (!userRef) {
                return res.status(401).json({ message: "User not authenticated" });
            }

            
            const userRepository = AppDataSource.getRepository(User);
            const user = await userRepository.findOne({
                where: { id: userRef.id },
                relations: ["userRoles", "userRoles.role"]
            });

            console.log(`getMe: Found user ${userRef.id}:`, !!user);

            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            return res.status(200).json({
                id: user.id,
                phoneNumber: user.phoneNumber,
                email: user.email,
                status: user.status,
                roles: user.userRoles.map(ur => ur.role.name),
                activeRole: user.activeRole || null,
                full_name: (user.email && user.email.includes('@')) ? user.email.split('@')[0] : 'Velo Admin',
                created_date: user.createdAt
            });
        } catch (error) {
            console.error("Error fetching user profile:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
