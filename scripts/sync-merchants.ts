import { AppDataSource } from "../src/db/data-source";
import { MerchantProfile, MerchantVerificationStatus } from "../src/models/merchant-profile";
import { UserRole, RoleStatus } from "../src/models/user-role";
import { Role, RoleType } from "../src/models/role";
import { MerchantStats } from "../src/models/merchant-stats";

async function sync() {
    try {
        console.log("Initializing database connection...");
        await AppDataSource.initialize();
        
        const profileRepo = AppDataSource.getRepository(MerchantProfile);
        const userRoleRepo = AppDataSource.getRepository(UserRole);
        const roleRepo = AppDataSource.getRepository(Role);
        const statsRepo = AppDataSource.getRepository(MerchantStats);
        
        const profiles = await profileRepo.find({
            where: { status: MerchantVerificationStatus.APPROVED }
        });
        
        console.log(`Found ${profiles.length} approved merchants to sync.`);
        
        const merchantRole = await roleRepo.findOne({ where: { name: RoleType.MERCHANT } });
        if (!merchantRole) {
            console.error("CRITICAL: MERCHANT role not found in 'roles' table!");
            process.exit(1);
        }

        for (const p of profiles) {
            console.log(`Syncing: ${p.businessName} (${p.userId})`);
            
            // 1. Ensure store is open
            if (!p.isOpen) {
                p.isOpen = true;
                await profileRepo.save(p);
                console.log("  - Opened store");
            }
            
            // 2. Ensure MERCHANT role exists and is APPROVED
            let userRole = await userRoleRepo.findOne({ 
                where: { userId: p.userId, roleId: merchantRole.id },
                relations: ["role"]
            });
            
            if (!userRole) {
                userRole = userRoleRepo.create({
                    userId: p.userId,
                    roleId: merchantRole.id,
                    status: RoleStatus.APPROVED
                });
                console.log("  - Created missing MERCHANT role");
            } else if (userRole.status !== RoleStatus.APPROVED) {
                userRole.status = RoleStatus.APPROVED;
                console.log("  - Updated role status to APPROVED");
            }
            await userRoleRepo.save(userRole);
            
            // 3. Ensure stats are initialized
            let stats = await statsRepo.findOne({ where: { merchantId: p.userId } });
            if (!stats) {
                stats = statsRepo.create({
                    merchantId: p.userId,
                    totalOrders: 0,
                    totalRevenue: 0,
                    totalProducts: 0,
                    viewCount: 0,
                    averageRating: 0,
                    ratingCount: 0
                });
                await statsRepo.save(stats);
                console.log("  - Initialized metrics");
            }
        }
        
        console.log("Sync complete!");
        process.exit(0);
    } catch (error) {
        console.error("Error during sync:", error);
        process.exit(1);
    }
}

sync();
