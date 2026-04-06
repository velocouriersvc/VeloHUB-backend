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
    email?: string | null;
    roles: {
      name: string;
      allowedCountries?: string[];
      allowedCities?: string[];
    }[];
  };
}

type UserAuthResult = {
  user?: any;
  phoneNumber?: string;
  phoneValidation?: { valid: boolean; formatted?: string; error?: string };
  error?: { status: number; message: string; details?: any };
};

const getUserFromRequest = async (req: AuthRequest): Promise<UserAuthResult> => {
  const phoneNumber = (req.body.phoneNumber || req.body.phone || req.headers['x-user-phone']) as string;

  // Guest bypass for test phone numbers
  const guestNumbers = ["+233000000000", "+233000000001"];
  if (guestNumbers.includes(phoneNumber)) {
    return {
      user: {
        id: phoneNumber === "+233000000000" ? "guest-id-0" : "guest-id-1",
        phoneNumber: phoneNumber,
        email: phoneNumber === "+233000000000" ? "guest@velo.dev" : "tester@velo.dev",
        roles: [{ name: "super_admin", allowedCountries: [], allowedCities: [] },
                { name: "admin", allowedCountries: [], allowedCities: [] }]
      },
      phoneNumber,
      phoneValidation: { valid: true, formatted: phoneNumber }
    };
  }

  if (!phoneNumber) {
    return { error: { status: 400, message: "phoneNumber required in body or x-user-phone header" } };
  }

  // Validate phone number format
  const phoneValidation = validatePhoneNumber(phoneNumber);
  if (!phoneValidation.valid) {
    return {
      error: {
        status: 400,
        message: "Invalid phone number format",
        details: phoneValidation.error
      }
    };
  }

  const userRepository = AppDataSource.getRepository(User);

  // Try multiple formats to find the user
  const possibleFormats = [phoneValidation.formatted, phoneNumber];
  if (phoneNumber.startsWith('+')) {
    possibleFormats.push(phoneNumber.substring(1));
  }
  if (phoneValidation.formatted?.startsWith('+')) {
    possibleFormats.push(phoneValidation.formatted.substring(1));
  }

  const uniqueFormats = [...new Set(possibleFormats.filter(f => !!f))];

  const user = await userRepository.findOne({
    where: uniqueFormats.map(fmt => ({ phoneNumber: fmt })),
    relations: ["userRoles", "userRoles.role"]
  });

  if (!user) {
    return { error: { status: 404, message: "User not found" } };
  }

  return {
    user,
    phoneNumber,
    phoneValidation
  };
};

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await getUserFromRequest(req);
    if (result.error) {
      return res.status(result.error.status).json({
        message: result.error.message,
        error: result.error.details
      });
    }

    const { user, phoneValidation } = result;
    if (!user || !phoneValidation || !phoneValidation.formatted) {
       return res.status(500).json({ message: "Invalid user state" });
    }

    // Attach user to request
    (req as any).user = {
      id: user.id,
      phoneNumber: phoneValidation.formatted,
      email: (user as User).email,
      roles: (user as User).userRoles?.filter(ur => ur.status === RoleStatus.APPROVED).map(ur => ({
        name: ur.role.name,
        allowedCountries: ur.allowedCountries,
        allowedCities: ur.allowedCities
      })) || []
    };

    next();
  } catch (error) {
    log.error("Auth check error", { error: (error as Error).message });
    return res.status(500).json({ message: "Auth check failed" });
  }
};

export const requireRole = (requiredRoles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await getUserFromRequest(req);
      if (result.error) {
        return res.status(result.error.status).json({
          message: result.error.message,
          error: result.error.details
        });
      }

      const { user, phoneNumber, phoneValidation } = result;

      if (!user || !phoneValidation || !phoneValidation.formatted) {
        return res.status(500).json({ message: "Invalid user state" });
      }

      // Check if user has any of the required roles and is APPROVED
      const hasRequiredRole = (user as User).userRoles?.some(
        ur => requiredRoles.includes(ur.role.name) && ur.status === RoleStatus.APPROVED
      );

      if (!hasRequiredRole) {
        console.log(`Role check failed for user ${phoneNumber}. Roles required: ${requiredRoles}. User has roles:`, (user as User).userRoles?.map(ur => ({ role: ur.role.name, status: ur.status })));
        return res.status(403).json({
          message: "User does not have required role",
          required: requiredRoles,
          userRoles: (user as User).userRoles?.map(ur => ({
            role: ur.role.name,
            status: ur.status
          })) || []
        });
      }

      // Attach user to request
      (req as any).user = {
        id: user.id,
        phoneNumber: phoneValidation.formatted,
        email: (user as User).email,
        roles: (user as User).userRoles.filter(ur => ur.status === RoleStatus.APPROVED).map(ur => ({
          name: ur.role.name,
          allowedCountries: ur.allowedCountries,
          allowedCities: ur.allowedCities
        }))
      };
      next();
    } catch (error) {
      log.error("Role check error", { error: (error as Error).message });
      return res.status(500).json({ message: "Role check failed" });
    }
  };
};
