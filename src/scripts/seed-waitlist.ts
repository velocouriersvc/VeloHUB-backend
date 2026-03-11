import { AppDataSource } from "../db/data-source";
import { WaitlistCountry } from "../models/waitlist-country";
import { Waitlist } from "../models/waitlist";

async function seedWaitlist() {
    await AppDataSource.initialize();
    console.log("Database initialized");

    const countryRepo = AppDataSource.getRepository(WaitlistCountry);
    const waitlistRepo = AppDataSource.getRepository(Waitlist);

    // 1. Add some countries
    const ghana = countryRepo.create({ name: "Ghana", code: "GH" });
    const nigeria = countryRepo.create({ name: "Nigeria", code: "NG" });
    await countryRepo.save([ghana, nigeria]);
    console.log("Seeded countries");

    // 2. Add some waitlist entries
    const entries = [
        waitlistRepo.create({
            fullName: "John Doe",
            email: "john@example.com",
            phoneNumber: "+233240000000",
            countryId: ghana.id
        }),
        waitlistRepo.create({
            fullName: "Jane Smith",
            email: "jane@example.com",
            phoneNumber: "+234800000000",
            countryId: nigeria.id
        })
    ];
    await waitlistRepo.save(entries);
    console.log("Seeded waitlist entries");

    await AppDataSource.destroy();
}

seedWaitlist().catch(console.error);
