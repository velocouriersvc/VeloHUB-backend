import { AppDataSource } from "../db/data-source";
import { ProductCategory } from "../models/product-category";

const DEFAULT_CATEGORIES: Array<{
    name: string;
    slug: string;
    icon?: string;
    type: string;
}> = [
    { name: "Food", slug: "food", icon: "fork.knife", type: "marketplace" },
    { name: "Grocery", slug: "grocery", icon: "cart.fill", type: "marketplace" },
    { name: "Pharmacy", slug: "pharmacy", icon: "cross.vial.fill", type: "marketplace" },
    { name: "Marketplace", slug: "marketplace", icon: "bag.fill", type: "marketplace" },
    { name: "Rentals", slug: "rentals", icon: "truck.fill", type: "marketplace" },
    { name: "Services", slug: "services", icon: "wrench.and.screwdriver.fill", type: "service" },
    { name: "Hair & Beauty", slug: "hair-beauty", icon: "scissors", type: "service" },
    { name: "Home Care", slug: "home-care", icon: "house", type: "service" },
    { name: "Tech Repair", slug: "tech-repair", icon: "desktopcomputer", type: "service" },
    { name: "Cleaning", slug: "cleaning", icon: "sparkles", type: "service" },
    { name: "Tutoring", slug: "tutoring", icon: "book.fill", type: "service" },
];

export async function seedProductCategories(alreadyInitialised = false) {
    if (!alreadyInitialised) {
        await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(ProductCategory);
    let created = 0;
    for (const category of DEFAULT_CATEGORIES) {
        const existing = await repo.findOne({ where: { slug: category.slug } });
        if (existing) {
            let shouldUpdate = false;
            if (!existing.type || existing.type !== category.type) {
                existing.type = category.type;
                shouldUpdate = true;
            }
            if (!existing.name || existing.name !== category.name) {
                existing.name = category.name;
                shouldUpdate = true;
            }
            if (existing.icon !== (category.icon || '')) {
                existing.icon = category.icon || '';
                shouldUpdate = true;
            }
            if (shouldUpdate) {
                await repo.save(existing);
                created++;
            }
            continue;
        }

        const row = repo.create({
            name: category.name,
            slug: category.slug,
            icon: category.icon || '',
            type: category.type,
            isActive: true,
        });
        await repo.save(row);
        created++;
    }

    if (created > 0) {
        console.log(`✅ product_categories: seeded ${created} rows`);
    }

    if (!alreadyInitialised) {
        await AppDataSource.destroy();
    }
}

if (require.main === module) {
    seedProductCategories(false)
        .then(() => console.log("Done - product_categories seeded."))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}
