import { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../db/data-source";
import { User, UserStatus } from "../models/user";
import { UserRole, RoleStatus } from "../models/user-role";
import { Role, RoleType } from "../models/role";
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
  const rawQueryPhone = req.query?.phoneNumber;
  const queryPhone = Array.isArray(rawQueryPhone) ? rawQueryPhone[0] : rawQueryPhone;
  let phoneNumber = (req.body.phoneNumber || req.body.phone || queryPhone || req.headers['x-user-phone']) as string;
  
  // Clean up stringified 'undefined' or 'null' that might come from some frontend fetch implementations
  if (phoneNumber === 'undefined' || phoneNumber === 'null') {
    phoneNumber = '';
  }

  // Guest bypass for test phone numbers
  const guestNumbers = ["+233000000000", "+233000000001", "+23300000000", "+23300000001"];
  if (guestNumbers.includes(phoneNumber)) {
    const guestId = (phoneNumber === "+233000000000" || phoneNumber === "+23300000000") 
      ? "00000000-0000-0000-0000-000000000000" 
      : "00000000-0000-0000-0000-000000000001";
    const guestEmail = (phoneNumber === "+233000000000" || phoneNumber === "+23300000000") ? "guest@velocouriersvc.com" : "danielkojo005@gmail.com";
    
    const userRepository = AppDataSource.getRepository(User);
    
    // First, try to find by ID
    let user = await userRepository.findOne({
      where: { id: guestId },
      relations: ["userRoles", "userRoles.role"]
    });

    // If not found by ID, try finding by phone number (in case of ID format transition)
    if (!user) {
      const userByPhone = await userRepository.findOne({ where: { phoneNumber } });
      if (userByPhone) {
        log.info("Found guest user with old ID format, migrating to UUID", { oldId: userByPhone.id, newId: guestId });
        // Since we can't easily change a primary key, we'll delete and recreate for these test users
        await userRepository.delete(userByPhone.id).catch(err => log.error("Failed to delete old guest user", { error: err.message }));
      }
    }

    if (!user) {
      try {
        log.info("Creating guest user in database", { guestId, phoneNumber });
        user = userRepository.create({
          id: guestId,
          phoneNumber: phoneNumber,
          email: guestEmail,
          status: UserStatus.ACTIVE,
          country: "GH"
        });
        await userRepository.save(user);

        // Give guest users some default roles
        const roleRepo = AppDataSource.getRepository(Role);
        const userRoleRepo = AppDataSource.getRepository(UserRole);
        
        const rolesToAssign = [RoleType.SUPER_ADMIN, RoleType.ADMIN, RoleType.BUYER, RoleType.MERCHANT, RoleType.DRIVER];
        for (const roleName of rolesToAssign) {
          const role = await roleRepo.findOne({ where: { name: roleName as any } });
          if (role) {
            const existingUR = await userRoleRepo.findOne({ where: { userId: guestId, roleId: role.id } });
            if (!existingUR) {
              await userRoleRepo.save(userRoleRepo.create({ 
                userId: guestId, 
                roleId: role.id, 
                status: RoleStatus.APPROVED,
                allowedCountries: [],
                allowedCities: []
              })).catch(err => log.warn("Failed to assign guest role", { roleName, error: err.message }));
            }
          }
        }
      } catch (err: any) {
        // If it's a duplicate key error, someone else might have created it
        log.warn("Guest user creation conflict or error", { guestId, error: err.message });
      }

      // Final attempt to get the user with all relations
      user = (await userRepository.findOne({
        where: { id: guestId },
        relations: ["userRoles", "userRoles.role"]
      })) || user;

      // Force update email if it changed (for testing)
      if (user && user.email !== guestEmail) {
        user.email = guestEmail;
        await userRepository.save(user);
      }
    }

    return {
      user,
      phoneNumber,
      phoneValidation: { valid: true, formatted: phoneNumber }
    };
  }

  if (!phoneNumber) {
    return { error: { status: 400, message: "phoneNumber required in body or x-user-phone header" } };
  }

  // Apple Sign-In users have no phone number — their UUID is stored as the auth identifier
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID_REGEX.test(phoneNumber)) {
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: phoneNumber },
      relations: ["userRoles", "userRoles.role"]
    });
    if (!user) {
      return { error: { status: 404, message: "User not found" } };
    }
    return { user, phoneNumber, phoneValidation: { valid: true, formatted: phoneNumber } };
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
      roles: (user as User).userRoles?.filter(ur => ur.status === RoleStatus.APPROVED && ur.role).map(ur => ({
        name: ur.role.name,
        allowedCountries: ur.allowedCountries,
        allowedCities: ur.allowedCities
      })) || []
    };

    next();
  } catch (error) {
    log.error("Auth check error", { 
      error: (error as Error).message, 
      stack: (error as Error).stack,
      url: req.url,
      method: req.method,
      phone: req.headers['x-user-phone']
    });
    return res.status(500).json({ message: "Auth check failed", details: (error as Error).message });
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
