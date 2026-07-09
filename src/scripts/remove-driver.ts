import { AppDataSource } from "../db/data-source";
import { User } from "../models/user";
import { DriverProfile } from "../models/driver-profile";
import { UserRole } from "../models/user-role";

/**
 * One-off ops script to remove a stale/test driver account (e.g. "Benjamin Kojo").
 *
 * Safe by default: it only PRINTS what it would delete. To actually delete, run with
 * CONFIRM_DELETE=true. Match by driver name (default) or phone:
 *
 *   REMOVE_DRIVER_NAME="Benjamin Kojo" npx ts-node src/scripts/remove-driver.ts
 *   REMOVE_DRIVER_PHONE="+233..." CONFIRM_DELETE=true npx ts-node src/scripts/remove-driver.ts
 *
 * FK-referenced history (rides, ratings, wallet) may block a hard delete; the script
 * reports any such error instead of leaving the DB half-deleted (it runs in a txn).
 */
async function main() {
    const name = process.env.REMOVE_DRIVER_NAME || "Benjamin Kojo";
    const phone = process.env.REMOVE_DRIVER_PHONE || "";
    const confirm = process.env.CONFIRM_DELETE === "true";

    await AppDataSource.initialize();
    const driverRepo = AppDataSource.getRepository(DriverProfile);
    const userRepo = AppDataSource.getRepository(User);

    // Find matching driver profiles (by name) and/or users (by phone).
    const profiles = phone
        ? await driverRepo
              .createQueryBuilder("d")
              .innerJoin(User, "u", "u.id = d.userId")
              .where("u.phoneNumber = :phone", { phone })
              .getMany()
        : await driverRepo
              .createQueryBuilder("d")
              .where("LOWER(d.fullName) = LOWER(:name)", { name })
              .getMany();

    if (profiles.length === 0) {
        console.log(`No driver profile found for ${phone || name}. Nothing to do.`);
        await AppDataSource.destroy();
        return;
    }

    for (const p of profiles) {
        const user = await userRepo.findOne({ where: { id: p.userId } });
        console.log(`Match: driverProfile=${p.id} user=${p.userId} name="${p.fullName}" phone="${user?.phoneNumber ?? "?"}"`);
    }

    if (!confirm) {
        console.log("\nDRY RUN. Re-run with CONFIRM_DELETE=true to delete the above account(s).");
        await AppDataSource.destroy();
        return;
    }

    for (const p of profiles) {
        await AppDataSource.transaction(async (tx) => {
            await tx.getRepository(UserRole).delete({ userId: p.userId });
            await tx.getRepository(DriverProfile).delete({ id: p.id });
            await tx.getRepository(User).delete({ id: p.userId });
        }).then(
            () => console.log(`Deleted driver account ${p.userId} ("${p.fullName}")`),
            (e) => console.error(`Could not delete ${p.userId}: ${(e as Error).message} (FK-referenced history may need archiving first)`)
        );
    }

    await AppDataSource.destroy();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
