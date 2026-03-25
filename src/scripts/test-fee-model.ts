import { AppDataSource } from "../db/data-source";
import { RideService } from "../services/ride-service";
import { PlatformSettings } from "../models/platform-settings";
import { Ride, RideStatus, RideType } from "../models/ride";
import { User, UserStatus } from "../models/user";
import { VehicleType } from "../models/vehicle-pricing";
import { Wallet } from "../models/wallet";
import { createServiceLogger } from "../utils/logger";
import { v4 as uuid } from "uuid";

const log = createServiceLogger("TestFeeModel");

async function testFeeModel() {
    try {
        await AppDataSource.initialize();
        log.info("Database initialized for testing");

        const rideService = new RideService();
        const settingsRepo = AppDataSource.getRepository(PlatformSettings);
        const userRepo = AppDataSource.getRepository(User);
        const rideRepo = AppDataSource.getRepository(Ride);
        const walletRepo = AppDataSource.getRepository(Wallet);

        // 1. Ensure settings exist for GH
        let settings = await settingsRepo.findOne({ where: { country: 'GH' } });
        if (!settings) {
            settings = settingsRepo.create({
                country: 'GH',
                rideCommissionRate: 25,
                deliveryTotalCommissionRate: 45,
                deliveryRidePortionRate: 50,
                deliveryServicePortionRate: 50,
                serviceCommissionRate: 15,
                currency: 'GHS',
                isActive: true,
                minimumOrderValue: 0,
                deliveryBaseFee: 10,
                deliveryPerKmFee: 2,
                defaultServiceFeeRate: 5,
                defaultPickupFeeRate: 10
            });
        } else {
            settings.rideCommissionRate = 25;
            settings.deliveryTotalCommissionRate = 45;
        }
        await settingsRepo.save(settings);
        log.info("Settings configured", { rideRate: 25, deliveryRate: 45 });

        // 2. Create a test customer and driver
        const rand = Math.floor(Math.random() * 1000000);
        const customer = await userRepo.save(userRepo.create({ 
            id: uuid(),
            phoneNumber: `+233${rand}01`, 
            status: UserStatus.ACTIVE,
            country: 'GH' 
        })) as User;
        const driver = await userRepo.save(userRepo.create({ 
            id: uuid(),
            phoneNumber: `+233${rand}02`, 
            status: UserStatus.ACTIVE,
            country: 'GH' 
        })) as User;

        // Create wallets
        await walletRepo.save(walletRepo.create({ userId: customer.id, balance: 0, currency: 'GHS' }));
        await walletRepo.save(walletRepo.create({ userId: driver.id, balance: 0, currency: 'GHS' }));
        log.info("Wallets created");

        // 3. Test Ride Fee Calculation
        const ride = await rideRepo.save(rideRepo.create({
            customerId: customer.id,
            driverId: driver.id,
            type: RideType.RIDE,
            status: RideStatus.ONGOING,
            pickupAddress: "123 Street",
            pickupLat: 5.6037,
            pickupLng: -0.1870,
            dropoffAddress: "456 Avenue",
            dropoffLat: 5.6147,
            dropoffLng: -0.1730,
            vehicleType: VehicleType.CAR,
            distanceKm: 5,
            durationMin: 15,
            baseFare: 10,
            subtotal: 100,
            finalFare: 100,
            currency: 'GHS'
        })) as Ride;

        log.info("Completing ride...");
        const completedRide = await rideService.completeRide(ride.id);
        
        log.info("Ride Results", {
            fare: completedRide.finalFare,
            commission: completedRide.commission,
            driverPayout: completedRide.driverPayout,
            expectedCommission: 25 // 25% of 100
        });

        if (Number(completedRide.commission) === 25) {
            log.info("✅ Ride fee calculation correct");
        } else {
            log.error("❌ Ride fee calculation failed", { actual: completedRide.commission });
        }

        // 4. Test Delivery Fee Calculation
        const delivery = await rideRepo.save(rideRepo.create({
            customerId: customer.id,
            driverId: driver.id,
            type: RideType.DELIVERY,
            status: RideStatus.ONGOING,
            pickupAddress: "789 Circle",
            pickupLat: 5.5537,
            pickupLng: -0.2070,
            dropoffAddress: "101 Square",
            dropoffLat: 5.5847,
            dropoffLng: -0.1930,
            vehicleType: VehicleType.BIKE,
            distanceKm: 8,
            durationMin: 25,
            baseFare: 20,
            subtotal: 200,
            finalFare: 200,
            currency: 'GHS'
        })) as Ride;

        log.info("Completing delivery...");
        const completedDelivery = await rideService.completeRide(delivery.id);
        
        log.info("Delivery Results", {
            fare: completedDelivery.finalFare,
            commission: completedDelivery.commission,
            driverPayout: completedDelivery.driverPayout,
            expectedCommission: 90 // 45% of 200
        });

        if (Number(completedDelivery.commission) === 90) {
            log.info("✅ Delivery fee calculation correct");
        } else {
            log.error("❌ Delivery fee calculation failed", { actual: completedDelivery.commission });
        }

        // Clean up
        await rideRepo.remove([ride, delivery]);
        await userRepo.remove([customer, driver]);
        
        log.info("Tests completed");
        process.exit(0);
    } catch (error) {
        log.error("Test failed", { error: (error as Error).message });
        process.exit(1);
    }
}

testFeeModel();
