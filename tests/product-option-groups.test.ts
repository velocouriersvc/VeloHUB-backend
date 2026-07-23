import { ProductService } from "../src/services/product-service";

/**
 * Guards "I'm unable to select multiple preferences".
 *
 * Food option groups were created with a hardcoded maxSelections of 1, so every group
 * the seller app produced was single-select and a buyer could not pick Egg AND Goat
 * meat AND Wele. The seller now chooses per group, and 0 means unlimited.
 */
describe("product option groups", () => {
    function makeService() {
        const svc = new ProductService();
        const savedGroups: any[] = [];
        const savedOptions: any[] = [];
        (svc as any).customizationRepo = {
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
            create: (x: any) => x,
            save: jest.fn().mockImplementation(async (g: any) => {
                const row = { ...g, id: `c${savedGroups.length + 1}` };
                savedGroups.push(row);
                return row;
            }),
        };
        (svc as any).optionRepo = {
            create: (x: any) => x,
            save: jest.fn().mockImplementation(async (rows: any) => { savedOptions.push(...rows); return rows; }),
        };
        return { svc, savedGroups, savedOptions };
    }

    const replace = (svc: ProductService, input: any) =>
        (svc as any).replaceCustomizations("p1", input);

    it("stores maxSelections 0 so the buyer can pick as many extras as they like", async () => {
        const { svc, savedGroups, savedOptions } = makeService();

        await replace(svc, {
            options: [{
                name: "Extras",
                maxSelections: 0,
                items: [{ name: "Egg", price: 2 }, { name: "GOAT meat", price: 1 }, { name: "Wele", price: 1 }],
            }],
        });

        expect(savedGroups).toHaveLength(1);
        expect(savedGroups[0].maxSelections).toBe(0);
        expect(savedOptions).toHaveLength(3);
    });

    it("still supports a pick-one group (sizes, service packages)", async () => {
        const { svc, savedGroups } = makeService();
        await replace(svc, { options: [{ name: "Packages", maxSelections: 1, items: [{ name: "Basic", price: 10 }] }] });
        expect(savedGroups[0].maxSelections).toBe(1);
    });

    it("defaults to pick-one when the client does not say (older app builds)", async () => {
        const { svc, savedGroups } = makeService();
        await replace(svc, { options: [{ name: "Extras", items: [{ name: "Egg", price: 2 }] }] });
        expect(savedGroups[0].maxSelections).toBe(1);
    });

    it("never leaves a blank group heading", async () => {
        const { svc, savedGroups } = makeService();
        await replace(svc, { options: [{ name: "   ", maxSelections: 0, items: [{ name: "Egg", price: 2 }] }] });
        expect(savedGroups[0].title).toBe("Extras");
    });

    it("ignores an empty options array so a non-food save cannot wipe existing groups", async () => {
        const { svc } = makeService();
        await replace(svc, { options: [] });
        expect((svc as any).customizationRepo.delete).not.toHaveBeenCalled();
    });

    it("does nothing when the payload carries no groups at all", async () => {
        const { svc } = makeService();
        await replace(svc, { name: "renamed only" });
        expect((svc as any).customizationRepo.delete).not.toHaveBeenCalled();
    });

    it("replaces rather than appends when groups are supplied", async () => {
        const { svc } = makeService();
        await replace(svc, { options: [{ name: "Extras", maxSelections: 0, items: [{ name: "Egg", price: 2 }] }] });
        expect((svc as any).customizationRepo.delete).toHaveBeenCalledWith({ productId: "p1" });
    });
});
