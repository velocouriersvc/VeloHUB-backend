import { AppDataSource } from "../db/data-source";
import { User, UserStatus } from "../models/user";
import { Role, RoleType } from "../models/role";
import { UserRole, RoleStatus } from "../models/user-role";

async function ensureAdminUser() {
    await AppDataSource.initialize();
    console.log("Database initialized");

    const userRepo = AppDataSource.getRepository(User);
    const roleRepo = AppDataSource.getRepository(Role);
    const userRoleRepo = AppDataSource.getRepository(UserRole);

    const adminPhone = "+233200000000";

    // 1. Ensure Admin Role exists
    let adminRole = await roleRepo.findOneBy({ name: RoleType.ADMIN });
    if (!adminRole) {
        adminRole = roleRepo.create({ name: RoleType.ADMIN, description: "System Administrator" });
        await roleRepo.save(adminRole);
        console.log("Created Admin Role");
    }

    // 2. Ensure User exists
    let adminUser = await userRepo.findOneBy({ phoneNumber: adminPhone });
    if (!adminUser) {
        adminUser = userRepo.create({
            id: "admin-test-id",
            phoneNumber: adminPhone,
            email: "admin@test.com",
            status: UserStatus.ACTIVE
        });
        await userRepo.save(adminUser);
        console.log("Created Admin User");
    }

    // 3. Ensure User has Admin Role
    let userRole = await userRoleRepo.findOne({
        where: { userId: adminUser.id, roleId: adminRole.id }
    });

    if (!userRole) {
        userRole = userRoleRepo.create({
            userId: adminUser.id,
            roleId: adminRole.id,
            status: RoleStatus.APPROVED
        });
        await userRoleRepo.save(userRole);
        console.log("Assigned Admin Role to User");
    } else if (userRole.status !== RoleStatus.APPROVED) {
        userRole.status = RoleStatus.APPROVED;
        await userRoleRepo.save(userRole);
        console.log("Updated Admin Role status to APPROVED");
    }

    console.log("Admin user preparation complete");
    await AppDataSource.destroy();
}

ensureAdminUser().catch(console.error);
