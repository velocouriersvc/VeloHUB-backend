import { Request, Response } from "express";
import { AuthService } from "../services/auth-service";
import { RequestOtpPayload, VerifyOtpPayload, AuthenticatedRequest } from "../types/auth";
import { AppDataSource } from "../db/data-source";
import { UserRole, RoleStatus } from "../models/user-role";
import { createServiceLogger } from "../utils/logger";
import { User } from "../models/user";
import { BuyerProfile } from "../models/buyer-profile";
import { DriverProfile } from "../models/driver-profile";
import { MerchantProfile } from "../models/merchant-profile";
import { UserProfile } from "../models/user-profile";
import { rewriteToPublicAssetUrl } from "../services/upload-service";

const log = createServiceLogger("AuthController");

export class AuthController {
    private authService = new AuthService();

    requestOTP = async (req: Request, res: Response) => {
        try {
            const { phoneNumber, channel = 'sms', email } = (req.body || {}) as { phoneNumber?: string; channel?: 'sms' | 'whatsapp' | 'email'; email?: string };

            if (!phoneNumber) {
                return res.status(400).json({ message: "Phone number is required" });
            }
            if (channel === 'email' && !email) {
                return res.status(400).json({ message: "Email is required for email verification" });
            }

            await this.authService.requestOtp(phoneNumber, channel, email);

            return res.status(200).json({
                message: channel === 'email' ? "Verification code sent to your email" : "OTP sent successfully"
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

    // Email + password registration & login
    register = async (req: Request, res: Response) => {
        try {
            const { firstName, lastName, email, phoneNumber, password, country } = req.body || {};
            if (!firstName || !lastName || !email || !phoneNumber || !password) {
                return res.status(400).json({ message: "firstName, lastName, email, phoneNumber and password are required" });
            }
            if (String(password).length < 6) {
                return res.status(400).json({ message: "Password must be at least 6 characters" });
            }
            const result = await this.authService.registerWithPassword({ firstName, lastName, email, phoneNumber, password, country });
            return res.status(201).json(result);
        } catch (error) {
            const message = (error as Error).message || "Internal server error";
            if (/already exists/i.test(message)) {
                return res.status(409).json({ message });
            }
            log.error("Error registering user", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    login = async (req: Request, res: Response) => {
        try {
            const { email, password } = req.body || {};
            if (!email || !password) {
                return res.status(400).json({ message: "Email and password are required" });
            }
            const result = await this.authService.loginWithPassword(email, password);
            if (!result) {
                return res.status(401).json({ message: "Invalid email or password" });
            }
            return res.status(200).json(result);
        } catch (error) {
            log.error("Error logging in with password", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };


    // Set or change password for the authenticated user (lets OTP users add a password)
    setPassword = async (req: Request, res: Response) => {
        try {
            const userRef = (req as any).user;
            if (!userRef?.id) {
                return res.status(401).json({ message: "User not authenticated" });
            }
            const { currentPassword, newPassword, email } = req.body || {};
            if (!newPassword || String(newPassword).length < 6) {
                return res.status(400).json({ message: "newPassword must be at least 6 characters" });
            }
            const result = await this.authService.setPassword(userRef.id, newPassword, currentPassword, email);
            return res.status(200).json(result);
        } catch (error) {
            const message = (error as Error).message || "Internal server error";
            if (/incorrect|already in use|at least 6/i.test(message)) {
                return res.status(400).json({ message });
            }
            log.error("Error setting password", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // Forgot password: email a reset code (always 200 - never reveal if email exists)
    forgotPassword = async (req: Request, res: Response) => {
        try {
            const { email } = req.body || {};
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
                return res.status(400).json({ message: "A valid email is required" });
            }
            await this.authService.requestPasswordReset(email);
            return res.status(200).json({
                success: true,
                message: "If an account exists for that email, a reset code has been sent.",
            });
        } catch (error) {
            log.error("Error requesting password reset", { error: (error as Error).message });
            // Still return 200 so we don't leak account existence via error timing/status.
            return res.status(200).json({
                success: true,
                message: "If an account exists for that email, a reset code has been sent.",
            });
        }
    };

    // Reset password using the emailed code
    resetPassword = async (req: Request, res: Response) => {
        try {
            const { email, code, newPassword } = req.body || {};
            if (!email || !code || !newPassword) {
                return res.status(400).json({ message: "email, code and newPassword are required" });
            }
            if (String(newPassword).length < 6) {
                return res.status(400).json({ message: "newPassword must be at least 6 characters" });
            }
            const result = await this.authService.resetPassword(email, code, newPassword);
            return res.status(200).json(result);
        } catch (error) {
            const message = (error as Error).message || "Internal server error";
            if (/invalid|expired|at least 6/i.test(message)) {
                return res.status(400).json({ message });
            }
            log.error("Error resetting password", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    appleSignIn = async (req: Request, res: Response) => {
        try {
            const { identityToken, fullName, email } = req.body as {
                identityToken: string;
                fullName?: string;
                email?: string;
            };

            if (!identityToken) {
                return res.status(400).json({ message: "identityToken is required" });
            }

            const result = await this.authService.appleSignIn(identityToken, fullName, email);
            return res.status(200).json(result);
        } catch (error) {
            log.error("Apple Sign-In failed", { error: (error as Error).message });
            const message = (error as Error).message;
            if (message.includes('expired') || message.includes('invalid') || message.includes('Invalid')) {
                return res.status(401).json({ message: `Apple Sign-In failed: ${message}` });
            }
            return res.status(500).json({ message: "Apple Sign-In failed. Please try again." });
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
            const guestNumbers = ["+233000000000", "+233000000001", "+23300000000", "+23300000001"];
            if (userRef && guestNumbers.includes(userRef.phoneNumber)) {
                const guestId = (userRef.phoneNumber === "+233000000000" || userRef.phoneNumber === "+23300000000") 
                    ? "00000000-0000-0000-0000-000000000000" 
                    : "00000000-0000-0000-0000-000000000001";
                const guestEmail = (userRef.phoneNumber === "+233000000000" || userRef.phoneNumber === "+23300000000") ? "guest@velohub.dev" : "admin2@velohub.dev";
                return res.status(200).json({
                    id: guestId,
                    phoneNumber: userRef.phoneNumber,
                    email: guestEmail,
                    status: "active",
                    roles: ["super_admin", "admin"],
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

            // Resolve actual display name from profile tables
            let fullName: string | null = null;
            let profileImageUrl: string | null = null;
            const userProfile = await AppDataSource.getRepository(UserProfile).findOne({ where: { userId: user.id } });
            if (userProfile?.fullName) {
                fullName = userProfile.fullName;
            }
            if (userProfile?.profileImageUrl) {
                profileImageUrl = rewriteToPublicAssetUrl(userProfile.profileImageUrl);
            }

            const buyerProfile = await AppDataSource.getRepository(BuyerProfile).findOne({ where: { userId: user.id } });
            if (!fullName && buyerProfile?.fullName) {
                fullName = buyerProfile.fullName;
            } else {
                const driverProfile = await AppDataSource.getRepository(DriverProfile).findOne({ where: { userId: user.id } });
                if (!fullName && driverProfile?.fullName) {
                    fullName = driverProfile.fullName;
                } else {
                    const merchantProfile = await AppDataSource.getRepository(MerchantProfile).findOne({ where: { userId: user.id } });
                    if (!fullName && merchantProfile?.businessName) {
                        fullName = merchantProfile.businessName;
                    }
                }
            }

            return res.status(200).json({
                id: user.id,
                phoneNumber: user.phoneNumber,
                email: user.email,
                status: user.status,
                roles: (user.userRoles as UserRole[]).filter((ur: UserRole) => ur.status === RoleStatus.APPROVED).map(ur => ur.role.name),
                activeRole: user.activeRole || null,
                full_name: fullName || user.email || user.phoneNumber,
                profile_image_url: profileImageUrl,
                has_password: !!user.passwordHash,
                created_date: user.createdAt
            });
        } catch (error) {
            console.error("Error fetching user profile:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
