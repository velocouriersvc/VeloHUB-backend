import { OrderService } from "./order-service";
import { RideService } from "./ride-service";
import { DeliveryType, OrderPaymentMethod } from "../models/order";
import { RideType, PaymentMethod } from "../models/ride";
import { VehicleType } from "../models/vehicle-pricing";

export type UnifiedCheckoutKind = "product_order" | "product_order_with_delivery" | "package_ride";

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
    requireDeliveryCode?: boolean;
}

export interface ProductOrderWithDeliveryCheckoutInput {
    kind: "product_order_with_delivery";
    deliveryType: DeliveryType;
    paymentMethod: OrderPaymentMethod;
    deliveryAddress: string;
    deliveryLat: number;
    deliveryLng: number;
    pickupAddress?: string;
    pickupLat?: number;
    pickupLng?: number;
    vehicleType: VehicleType;
    distanceKm: number;
    durationMin: number;
    promoCode?: string;
    customerNote?: string;
    phoneNumber?: string;
    requireDeliveryCode?: boolean;
    stops?: Array<{ address: string; lat: number; lng: number; stopOrder: number }>;
    sharedContacts?: Array<{ name: string; phone: string }>;
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
    paymentMethod?: string;
    // The sender's contact, needed to charge the prepayment. Mobile money REQUIRES a
    // phone number; without it the charge threw and the package never reached Paystack.
    phoneNumber?: string;
    email?: string;
}

export type UnifiedCheckoutInput = ProductOrderCheckoutInput | ProductOrderWithDeliveryCheckoutInput | PackageRideCheckoutInput;

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
                requireDeliveryCode: input.requireDeliveryCode,
            });
            return {
                kind: input.kind,
                order: result.order,
                payment: result.payment,
            };
        }

        if (input.kind === "product_order_with_delivery") {
            if (input.deliveryType !== DeliveryType.DELIVERY) {
                throw new Error("product_order_with_delivery requires deliveryType to be DELIVERY");
            }

            const orderResult = await this.orderService.checkout(userId, {
                deliveryType: input.deliveryType,
                deliveryAddress: input.deliveryAddress,
                deliveryLat: input.deliveryLat,
                deliveryLng: input.deliveryLng,
                paymentMethod: input.paymentMethod,
                promoCode: input.promoCode,
                customerNote: input.customerNote,
                phoneNumber: input.phoneNumber,
                requireDeliveryCode: input.requireDeliveryCode,
            });

            let ride = null;
            let rideError: string | null = null;

            try {
                const pickupAddress = input.pickupAddress || "";
                const pickupLat = input.pickupLat ?? 0;
                const pickupLng = input.pickupLng ?? 0;

                if (!pickupAddress || !pickupLat || !pickupLng) {
                    throw new Error("Pickup address and coordinates are required for delivery ride requests");
                }

                ride = await this.rideService.requestRide({
                    customerId: userId,
                    type: RideType.DELIVERY,
                    pickupAddress,
                    pickupLat,
                    pickupLng,
                    dropoffAddress: input.deliveryAddress,
                    dropoffLat: input.deliveryLat,
                    dropoffLng: input.deliveryLng,
                    vehicleType: input.vehicleType,
                    distanceKm: input.distanceKm,
                    durationMin: input.durationMin,
                    promoCode: input.promoCode,
                    // Classify cash vs online at creation so settlement never credits
                    // a fare the platform did not collect.
                    paymentMethod: input.paymentMethod as unknown as PaymentMethod,
                    stops: input.stops,
                    sharedContacts: input.sharedContacts,
                });
            } catch (error) {
                rideError = (error as Error).message;
            }

            return {
                kind: input.kind,
                order: orderResult.order,
                payment: orderResult.payment,
                ride,
                rideError,
            };
        }

        const packageRideInput = input as PackageRideCheckoutInput;
        const ride = await this.rideService.requestRide({
            customerId: userId,
            type: RideType.DELIVERY,
            pickupAddress: packageRideInput.pickupAddress,
            pickupLat: packageRideInput.pickupLat,
            pickupLng: packageRideInput.pickupLng,
            dropoffAddress: packageRideInput.dropoffAddress,
            dropoffLat: packageRideInput.dropoffLat,
            dropoffLng: packageRideInput.dropoffLng,
            vehicleType: packageRideInput.vehicleType,
            distanceKm: packageRideInput.distanceKm,
            durationMin: packageRideInput.durationMin,
            promoCode: packageRideInput.promoCode,
            paymentMethod: (packageRideInput.paymentMethod as PaymentMethod) || undefined,
            // Required so mobile money can charge the sender before dispatch.
            phoneNumber: packageRideInput.phoneNumber,
            email: packageRideInput.email,
        });

        return {
            kind: input.kind,
            ride,
            // Lift the gateway fields to the top level (the app reads them here), mirroring
            // the passenger prepaid flow, so the payment webview always has a matching
            // reference. They remain on `ride` too for backward compatibility.
            authorizationUrl: (ride as any).authorizationUrl,
            paymentReference: (ride as any).paymentReference,
        };
    }
}

