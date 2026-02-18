import { Request, Response } from "express";
import { AuthService } from "../services/auth-service.js";

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
}
