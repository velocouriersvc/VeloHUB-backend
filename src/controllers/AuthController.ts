import { Request, Response } from "express";
import { AuthService } from "../services/auth-service";

export class AuthController {
    private authService = new AuthService();

    requestOTP = async (req: Request, res: Response) => {
        try {
            const { phoneNumber } = req.body;

            if (!phoneNumber) {
                return res.status(400).json({ message: "Phone number is required" });
            }

            await this.authService.requestOtp(phoneNumber);

            return res.status(200).json({ message: "OTP sent successfully" });
        } catch (error) {
            console.error("Error requesting OTP:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    verifyOTP = async (req: Request, res: Response) => {
        try {
            const { phoneNumber, code } = req.body;

            if (!phoneNumber || !code) {
                return res.status(400).json({ message: "Phone number and code are required" });
            }

            const result = await this.authService.verifyOtp(phoneNumber, code);

            if (!result) {
                return res.status(401).json({ message: "Invalid or expired OTP" });
            }

            return res.status(200).json({
                token: result.token,
                user: {
                    ...result.user,
                    is_new_user: result.isNewUser,
                },
            });
        } catch (error) {
            console.error("Error verifying OTP:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };


    syncUser = async (req: Request, res: Response) => {
        try {
            const supabaseUser = (req as any).user;

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

    getConfig = (req: Request, res: Response) => {
        const config = {
            supabaseUrl: process.env.SUPABASE_URL,
            supabaseKey: process.env.SUPABASE_ANON_KEY
        };
        return res.status(200).json(config);
        return res.status(200).json(config);
    };

    searchUser = async (req: Request, res: Response) => {
        try {
            const { phone } = req.query;

            if (!phone || typeof phone !== 'string') {
                return res.status(400).json({ message: "Phone number is required as a query parameter (e.g., ?phone=+123456789)" });
            }

            const user = await this.authService.findByPhone(phone);

            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            return res.status(200).json(user);
        } catch (error) {
            console.error("Error searching user:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
