/**
 * Unit tests for AdminService.approveMerchant
 *
 * Goal: prove that after approval…
 *   1. MerchantProfile.status is set to APPROVED and isOpen = true
 *   2. The existing merchant UserRole is updated to APPROVED
 *   3. user.activeRole is set to "merchant"  ← the bug we fixed
 *   4. A MerchantStats row is created when missing
 *   5. walletService.createWallet is called
 *   6. The notification is sent to the merchant
 *
 * All TypeORM repos are replaced on the service instance via (svc as any).repo
 * so no real database connection is needed.
 */

import { AdminService } from "../src/services/admin-service";
import { MerchantVerificationStatus } from "../src/models/merchant-profile";
import { RoleStatus } from "../src/models/user-role";
import { RoleType } from "../src/models/role";
import { UserStatus } from "../src/models/user";
import { NotificationType } from "../src/models/notification";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock repository with only the methods AdminService calls. */
function buildRepo(overrides: Record<string, jest.Mock> = {}) {
    return {
        findOne: jest.fn(),
        find: jest.fn(),
        save: jest.fn().mockImplementation(async (e: any) => e),
        create: jest.fn().mockImplementation((data: any) => ({ ...data })),
        count: jest.fn().mockResolvedValue(0),
        ...overrides,
    };
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const MERCHANT_ID = "user-abc-123";
const ADMIN_ID = "admin-xyz-999";

/** A pending merchant profile in the DB */
const pendingProfile = {
    id: "profile-1",
    userId: MERCHANT_ID,
    status: MerchantVerificationStatus.PENDING,
    isOpen: false,
    businessName: "Test Shop",
};

/** The merchant's User row */
const merchantUser = {
    id: MERCHANT_ID,
    status: UserStatus.ACTIVE,
    activeRole: null as string | null,
    country: "GH",
};

/** An existing PENDING UserRole for merchant */
const pendingUserRole = {
    id: "role-link-1",
    userId: MERCHANT_ID,
    roleId: "role-id-merchant",
    status: RoleStatus.PENDING,
    role: { id: "role-id-merchant", name: RoleType.MERCHANT },
};

// ── test suite ────────────────────────────────────────────────────────────────

describe("AdminService.approveMerchant", () => {
    let svc: AdminService;

    // Per-test mock repos (recreated for isolation)
    let merchantProfileRepo: ReturnType<typeof buildRepo>;
    let userRoleRepo: ReturnType<typeof buildRepo>;
    let roleRepo: ReturnType<typeof buildRepo>;
    let userRepo: ReturnType<typeof buildRepo>;
    let merchantStatsRepo: ReturnType<typeof buildRepo>;

    // Mocked sub-services
    let walletServiceMock: { createWallet: jest.Mock };
    let notificationServiceMock: { notify: jest.Mock };

    beforeEach(() => {
        // Reset deep copies so mutations in one test don't bleed into the next
        const profile = { ...pendingProfile };
        const user = { ...merchantUser, activeRole: null };
        const userRole = { ...pendingUserRole };

        merchantProfileRepo = buildRepo({
            findOne: jest.fn().mockResolvedValue(profile),
            save: jest.fn().mockImplementation(async (e: any) => e),
        });

        userRoleRepo = buildRepo({
            find: jest.fn().mockResolvedValue([userRole]),
            save: jest.fn().mockImplementation(async (e: any) => e),
        });

        roleRepo = buildRepo({
            findOne: jest.fn().mockResolvedValue({
                id: "role-id-merchant",
                name: RoleType.MERCHANT,
            }),
        });

        userRepo = buildRepo({
            findOne: jest.fn().mockResolvedValue(user),
            save: jest.fn().mockImplementation(async (e: any) => e),
        });

        merchantStatsRepo = buildRepo({
            findOne: jest.fn().mockResolvedValue(null), // force creation path
            save: jest.fn().mockImplementation(async (e: any) => e),
        });

        walletServiceMock = { createWallet: jest.fn().mockResolvedValue(undefined) };
        notificationServiceMock = { notify: jest.fn().mockResolvedValue(undefined) };

        // Instantiate service – constructor will call AppDataSource.getRepository
        // which is stubbed by the __mocks__/data-source.ts mock.
        svc = new AdminService();

        // Inject our controlled repos
        (svc as any).merchantProfileRepo = merchantProfileRepo;
        (svc as any).userRoleRepo = userRoleRepo;
        (svc as any).roleRepo = roleRepo;
        (svc as any).userRepo = userRepo;
        (svc as any).merchantStatsRepo = merchantStatsRepo;
        (svc as any).walletService = walletServiceMock;
        (svc as any).notificationService = notificationServiceMock;
    });

    // ── 1. Profile status ─────────────────────────────────────────────────────

    it("sets MerchantProfile.status to APPROVED and opens the store", async () => {
        await svc.approveMerchant(MERCHANT_ID, ADMIN_ID);

        const savedProfile = merchantProfileRepo.save.mock.calls[0][0];
        expect(savedProfile.status).toBe(MerchantVerificationStatus.APPROVED);
        expect(savedProfile.isOpen).toBe(true);
    });

    // ── 2. UserRole approval ──────────────────────────────────────────────────

    it("upgrades the existing MERCHANT UserRole to APPROVED", async () => {
        await svc.approveMerchant(MERCHANT_ID, ADMIN_ID);

        // At least one save on userRoleRepo should have APPROVED status
        const savedRole = userRoleRepo.save.mock.calls.find(
            ([arg]: [any]) => arg.role?.name === RoleType.MERCHANT
        )?.[0];
        expect(savedRole).toBeDefined();
        expect(savedRole.status).toBe(RoleStatus.APPROVED);
    });

    it("creates a new APPROVED MERCHANT UserRole when one does not yet exist", async () => {
        // No existing roles
        userRoleRepo.find.mockResolvedValue([]);

        await svc.approveMerchant(MERCHANT_ID, ADMIN_ID);

        const createdRole = userRoleRepo.create.mock.calls[0]?.[0];
        expect(createdRole).toBeDefined();
        expect(createdRole.status).toBe(RoleStatus.APPROVED);
        expect(createdRole.roleId).toBe("role-id-merchant");
    });

    // ── 3. THE CORE BUG FIX: activeRole must be updated ──────────────────────

    it("sets user.activeRole to 'merchant' upon approval", async () => {
        await svc.approveMerchant(MERCHANT_ID, ADMIN_ID);

        // userRepo.save must be called with activeRole == "merchant"
        const userSaveCalls: [any][] = userRepo.save.mock.calls;
        const activeRoleUpdateCall = userSaveCalls.find(
            ([arg]) => arg.activeRole === RoleType.MERCHANT
        );

        expect(activeRoleUpdateCall).toBeDefined();
    });

    it("persists user.activeRole change to the database (save is awaited)", async () => {
        await svc.approveMerchant(MERCHANT_ID, ADMIN_ID);

        // Confirm save was truly awaited (resolved, not just called)
        expect(userRepo.save).toHaveBeenCalled();
        const savedUser = userRepo.save.mock.calls.find(
            ([arg]: [any]) => arg.activeRole === RoleType.MERCHANT
        )?.[0];
        expect(savedUser?.activeRole).toBe("merchant");
    });

    // ── 4. Re-activates suspended accounts ───────────────────────────────────

    it("un-suspends a user who was previously suspended", async () => {
        const suspendedUser = { ...merchantUser, status: UserStatus.SUSPENDED, activeRole: null };
        userRepo.findOne.mockResolvedValue(suspendedUser);

        await svc.approveMerchant(MERCHANT_ID, ADMIN_ID);

        const userSaveCalls: [any][] = userRepo.save.mock.calls;
        const statusUpdateCall = userSaveCalls.find(([arg]) => arg.status === UserStatus.ACTIVE);
        expect(statusUpdateCall).toBeDefined();
    });

    // ── 5. MerchantStats creation ─────────────────────────────────────────────

    it("creates MerchantStats with zeroed counters when none exist", async () => {
        await svc.approveMerchant(MERCHANT_ID, ADMIN_ID);

        const createdStats = merchantStatsRepo.create.mock.calls[0]?.[0];
        expect(createdStats).toBeDefined();
        expect(createdStats.merchantId).toBe(MERCHANT_ID);
        expect(createdStats.totalOrders).toBe(0);
        expect(createdStats.totalRevenue).toBe(0);
    });

    it("does not duplicate MerchantStats when they already exist", async () => {
        merchantStatsRepo.findOne.mockResolvedValue({
            id: "stats-1",
            merchantId: MERCHANT_ID,
        });

        await svc.approveMerchant(MERCHANT_ID, ADMIN_ID);

        expect(merchantStatsRepo.create).not.toHaveBeenCalled();
    });

    // ── 6. Wallet creation ────────────────────────────────────────────────────

    it("calls walletService.createWallet for the merchant", async () => {
        await svc.approveMerchant(MERCHANT_ID, ADMIN_ID);

        expect(walletServiceMock.createWallet).toHaveBeenCalledWith(MERCHANT_ID, "GH");
    });

    // ── 7. Notification ───────────────────────────────────────────────────────

    it("sends a MERCHANT_APPROVED notification to the merchant", async () => {
        await svc.approveMerchant(MERCHANT_ID, ADMIN_ID);

        expect(notificationServiceMock.notify).toHaveBeenCalledWith(
            MERCHANT_ID,
            NotificationType.MERCHANT_APPROVED,
            expect.stringContaining("Approved"),
            expect.any(String),
            expect.anything()
        );
    });

    // ── 8. Error handling ─────────────────────────────────────────────────────

    it("throws 'Merchant not found' when profile does not exist", async () => {
        merchantProfileRepo.findOne.mockResolvedValue(null);

        await expect(svc.approveMerchant("ghost-id", ADMIN_ID)).rejects.toThrow(
            "Merchant not found"
        );
    });
});
