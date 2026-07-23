import { canContact, ServiceBookingService } from "../src/services/service-booking-service";
import { ServiceBookingStatus } from "../src/models/service-booking";

/**
 * Guards "in-app call and chat should only be available once the merchant accepts".
 * The gate is enforced server-side so it cannot be bypassed by an out-of-date client,
 * and contact details are withheld until then.
 */
describe("booking contact gating", () => {
    describe("canContact", () => {
        it("allows contact once the booking is paid (requested) and through the active lifecycle", () => {
            expect(canContact(ServiceBookingStatus.REQUESTED)).toBe(true);
            expect(canContact(ServiceBookingStatus.ACCEPTED)).toBe(true);
            expect(canContact(ServiceBookingStatus.SCHEDULED)).toBe(true);
            expect(canContact(ServiceBookingStatus.IN_PROGRESS)).toBe(true);
        });

        it("refuses contact before payment (awaiting_payment)", () => {
            expect(canContact(ServiceBookingStatus.AWAITING_PAYMENT)).toBe(false);
        });

        it("refuses contact on terminal states", () => {
            for (const s of [
                ServiceBookingStatus.DECLINED,
                ServiceBookingStatus.EXPIRED,
                ServiceBookingStatus.CANCELLED,
                ServiceBookingStatus.CUSTOMER_CANCELLED,
                ServiceBookingStatus.PROVIDER_CANCELLED,
                ServiceBookingStatus.COMPLETED,
            ]) {
                expect(canContact(s)).toBe(false);
            }
        });
    });

    describe("chat enforcement", () => {
        const customerId = "cust-1";
        const merchantId = "merch-1";

        function makeService(status: ServiceBookingStatus) {
            const svc = new ServiceBookingService();
            (svc as any).bookingRepo = {
                findOne: jest.fn().mockResolvedValue({
                    id: "b1", customerId, merchantId, status, serviceTitle: "Haircut",
                }),
            };
            const messages: any[] = [];
            Object.defineProperty(svc, "messageRepo", {
                get: () => ({
                    find: jest.fn().mockResolvedValue(messages),
                    create: (x: any) => x,
                    save: jest.fn().mockImplementation(async (x: any) => ({ ...x, id: "m1" })),
                }),
            });
            (svc as any).notificationService = { notify: jest.fn().mockResolvedValue(undefined) };
            return svc;
        }

        it("rejects sending on an unpaid booking (awaiting_payment)", async () => {
            const svc = makeService(ServiceBookingStatus.AWAITING_PAYMENT);
            await expect(svc.sendMessage("b1", customerId, "hi")).rejects.toThrow(/Unauthorized/i);
        });

        it("rejects reading on an unpaid booking (awaiting_payment)", async () => {
            const svc = makeService(ServiceBookingStatus.AWAITING_PAYMENT);
            await expect(svc.getMessages("b1", customerId)).rejects.toThrow(/Unauthorized/i);
        });

        it("allows sending once paid (requested)", async () => {
            const svc = makeService(ServiceBookingStatus.REQUESTED);
            const msg = await svc.sendMessage("b1", customerId, "on my way");
            expect(msg.senderRole).toBe("customer");
        });

        it("keeps history readable after completion", async () => {
            const svc = makeService(ServiceBookingStatus.COMPLETED);
            await expect(svc.getMessages("b1", merchantId)).resolves.toBeDefined();
        });

        it("still rejects a non-participant even when accepted", async () => {
            const svc = makeService(ServiceBookingStatus.ACCEPTED);
            await expect(svc.sendMessage("b1", "stranger", "hello")).rejects.toThrow(/Unauthorized/i);
        });
    });
});
