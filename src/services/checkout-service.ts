import { OrderService } from "./order-service";
import { RideService } from "./ride-service";
import { DeliveryType, OrderPaymentMethod } from "../models/order";
import { RideType } from "../models/ride";
import { VehicleType } from "../models/vehicle-pricing";

export type UnifiedCheckoutKind = "product_order" | "package_ride";

export interface ProductOrderCheckoutInput {
    kind: "product_order";
    deliveryType: DeliveryType;
    paymentMethod: OrderPaymentMethod;
    deliveryAddress?: string;
    deliveryLat?: number;
    deliveryLng?: number;
    promoCode?: string;
    customerNote?: string;
    phoneNumber?: string;
}

export interface PackageRideCheckoutInput {
    kind: "package_ride";
    pickupAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropoffAddress: string;
    dropoffLat: number;
    dropoffLng: number;
    vehicleType: VehicleType;
    distanceKm: number;
    durationMin: number;
    promoCode?: string;
}

export type UnifiedCheckoutInput = ProductOrderCheckoutInput | PackageRideCheckoutInput;

export class CheckoutService {
    private orderService = new OrderService();
    private rideService = new RideService();

    async checkout(userId: string, input: UnifiedCheckoutInput) {
        if (input.kind === "product_order") {
            const result = await this.orderService.checkout(userId, {
                deliveryType: input.deliveryType,
                deliveryAddress: input.deliveryAddress,
                deliveryLat: input.deliveryLat,
                deliveryLng: input.deliveryLng,
                paymentMethod: input.paymentMethod,
                promoCode: input.promoCode,
                customerNote: input.customerNote,
                phoneNumber: input.phoneNumber,
            });
            return {
                kind: input.kind,
                order: result.order,
                payment: result.payment,
            };
        }

        const ride = await this.rideService.requestRide({
            customerId: userId,
            type: RideType.DELIVERY,
            pickupAddress: input.pickupAddress,
            pickupLat: input.pickupLat,
            pickupLng: input.pickupLng,
            dropoffAddress: input.dropoffAddress,
            dropoffLat: input.dropoffLat,
            dropoffLng: input.dropoffLng,
            vehicleType: input.vehicleType,
            distanceKm: input.distanceKm,
            durationMin: input.durationMin,
            promoCode: input.promoCode,
        });

        return {
            kind: input.kind,
            ride,
        };
    }
}

