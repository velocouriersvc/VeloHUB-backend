import { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../db/data-source";
import { User } from "../models/user";
import { UserRole, RoleStatus } from "../models/user-role";
import { validatePhoneNumber } from "../utils/phone-validator";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("RoleMiddleware");

export interface AuthRequest extends Request {
  user?: {
    id: string;
    phoneNumber: string;
    roles: string[];
  };
}

export const requireRole = (requiredRoles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const phoneNumber = (req.body.phoneNumber || req.headers['x-user-phone']) as string;

    if (!phoneNumber) {
      return res.status(400).json({ message: "phoneNumber required in body or x-user-phone header" });
    }

    // Validate phone number format
    const phoneValidation = validatePhoneNumber(phoneNumber);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        message: "Invalid phone number format",
        error: phoneValidation.error
      });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);

      // Find user by phone number
      const user = await userRepository.findOne({
        where: { phoneNumber: phoneValidation.formatted },
        relations: ["userRoles", "userRoles.role"]
      });

      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      }

      // Check if user has any of the required roles and is APPROVED
      const hasRequiredRole = user.userRoles?.some(
        ur => requiredRoles.includes(ur.role.name) && ur.status === RoleStatus.APPROVED
      );

      if (!hasRequiredRole) {
        console.log(`Role check failed for user ${phoneNumber}. Roles required: ${requiredRoles}. User has roles:`, user.userRoles?.map(ur => ({ role: ur.role.name, status: ur.status })));
        return res.status(403).json({
          message: "User does not have required role",
          required: requiredRoles,
          userRoles: user.userRoles?.map(ur => ({
            role: ur.role.name,
            status: ur.status
          }))
        });
      }

      // Attach user to request
      (req as any).user = {
        id: user.id,
        phoneNumber: phoneValidation.formatted,
        roles: user.userRoles.map(ur => ur.role.name)
      };
      next();
    } catch (error) {
      log.error("Role check error", { error: (error as Error).message });
      return res.status(500).json({ message: "Role check failed" });
    }
  };
};
