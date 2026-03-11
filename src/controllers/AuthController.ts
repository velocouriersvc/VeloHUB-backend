import { Request, Response } from "express";
import { AuthService } from "../services/auth-service";
import { RequestOtpPayload, VerifyOtpPayload, AuthenticatedRequest } from "../types/auth";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("AuthController");

export class AuthController {
    private authService = new AuthService();

    requestOTP = async (req: Request, res: Response) => {
        try {
            const { phoneNumber } = req.body as RequestOtpPayload;

            if (!phoneNumber) {
                return res.status(400).json({ message: "Phone number is required" });
            }

            await this.authService.requestOtp(phoneNumber);

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
            log.error("Error syncing user", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
