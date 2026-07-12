# 🏪 Velo Marketplace & Services - Phase 2 Master Plan

> **Date:** 11 March 2026
> **Status:** Planning
> **Scope:** Marketplace, Orders, Cart, Products, Merchant Operations, Cash Settlement, Pickup Codes, Admin Back-Office

---

## 📋 Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [What Already Exists (Reuse)](#2-what-already-exists-reuse)
3. [New Database Tables](#3-new-database-tables)
4. [TypeORM Models to Create](#4-typeorm-models-to-create)
5. [New Enums & Types](#5-new-enums--types)
6. [API Endpoints & Response Contracts](#6-api-endpoints--response-contracts)
7. [Services to Create](#7-services-to-create)
8. [Admin Back-Office Endpoints](#8-admin-back-office-endpoints)
9. [Cash Settlement & Wallet Logic](#9-cash-settlement--wallet-logic)
10. [Infrastructure - Redis & MinIO Usage](#10-infrastructure--redis--minio-usage)
11. [K8s / Deployment Impact](#11-k8s--deployment-impact)
12. [Migration & Rollout Strategy](#12-migration--rollout-strategy)
13. [Implementation Phases](#13-implementation-phases)

---

## 1. Current State Audit

### Stack
| Component | Technology |
|---|---|
| Runtime | Express + TypeScript |
| ORM | TypeORM (synchronize: true) |
| Database | PostgreSQL 16 (K8s StatefulSet, 10Gi PVC) |
| Cache | Redis 7-alpine (K8s, 128mb, allkeys-lru, **no persistence**) |
| Object Storage | MinIO (K8s, 20Gi PVC, `velo-uploads` bucket) |
| Payments | Paystack (momo, card) + Cash + Wallet |
| Notifications | In-app DB + Twilio SMS/WhatsApp + Push Tokens |
| Auth | API Key (`x-api-key`) + Phone-based role middleware (`x-user-phone`) |
| Monitoring | Prometheus (`prom-client`) + `/metrics` endpoint |
| Docs | Swagger (swagger-jsdoc + swagger-ui) |
| Deployment | K8s namespace `velo`, 2 replicas, GHCR image, Nginx ingress |

### Existing Models (TypeORM entities in `src/models/`)
| Model | Table | Purpose |
|---|---|---|
| `User` | `users` | Core user (id from Supabase, phone, email, status, activeRole) |
| `Role` | `roles` | buyer, driver, merchant, admin |
| `UserRole` | `user_roles` | Many-to-many user↔role with status (pending/approved/rejected/suspended) |
| `BuyerProfile` | `buyer_profiles` | fullName, region, primaryLocation |
| `DriverProfile` | `driver_profiles` | fullName, license, vehicle, plate, status |
| `MerchantProfile` | `merchant_profiles` | businessName, category, address, lat/lng, status |
| `Identification` | `identifications` | ID card/passport/license verification |
| `Ride` | `rides` | Full ride model (type, pickup/dropoff, fare breakdown, status, promo) |
| `RideStop` | `ride_stops` | Multi-stop support |
| `RideSharedContact` | `ride_shared_contacts` | Emergency contacts for rides |
| `VehiclePricing` | `vehicle_pricing` | Per-vehicle-type fare config |
| `SurgeRule` | `surge_rules` | Time-based surge multipliers |
| `Wallet` | `wallets` | userId, balance, currency |
| `WalletTransaction` | `wallet_transactions` | credit/debit with balanceBefore/After |
| `Payment` | `payments` | rideId/orderId, method, platformFee, driverAmount |
| `PromoCode` | `promo_codes` | Discount codes with limits |
| `Rating` | `ratings` | Ride ratings (rideId, driverId, customerId) |
| `Notification` | `notifications` | In-app notifications with type enum |
| `PushToken` | `push_tokens` | Device push tokens (iOS/Android) |
| `SavedLocation` | `saved_locations` | User's saved addresses |
| `Waitlist` | `waitlist` | Pre-launch waitlist |
| `WaitlistCountry` | `waitlist_countries` | Country availability |
| `DriverStats` | `driver_stats` | Aggregate stats (totalRides, earnings, avgRating) |

### Existing Services
| Service | Purpose |
|---|---|
| `AuthService` | OTP-based auth, role assignment |
| `RideService` | Fare calc, ride lifecycle |
| `DriverMatchService` | Find & assign drivers |
| `FareService` | Pricing calculations |
| `PaymentService` | Paystack + wallet + cash payments |
| `WalletService` | Credit/debit/balance/history |
| `RedisLocationService` | Live driver lat/lng, status, nearby search |
| `NotificationService` | In-app + push + SMS + WhatsApp |
| `UploadService` | MinIO file uploads with validation |
| `LocationService` | Saved locations CRUD |
| `PlacesService` | Google Places autocomplete |
| `RatingService` | Post-ride ratings |
| `ProfileService` | User profile management |
| `TwilioService` | SMS/WhatsApp via Twilio |
| `OTPService` | OTP generation & verification |

### Existing Admin Endpoints (`/api/v1/admin`)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/drivers` | List all drivers |
| GET | `/admin/merchants` | List all merchants |
| GET | `/admin/rides` | List recent rides |
| GET | `/admin/users` | List all users |
| PATCH | `/admin/drivers/:id` | Update driver status |
| PATCH | `/admin/merchants/:id` | Update merchant status |

---

## 2. What Already Exists (Reuse)

✅ **No new infrastructure needed.** We reuse everything:

| Need | Already Have | Notes |
|---|---|---|
| Product images | **MinIO** (`velo-uploads` bucket) | Add `products` upload category |
| Cart/order caching | **Redis** | Session carts, rate limiting, order locks |
| User/role system | **User + Role + UserRole** | Merchant role already exists, just needs approval flow |
| Wallet & settlements | **Wallet + WalletTransaction** | Extend for merchant credits/debits |
| Payment processing | **PaymentService** (Paystack) | Extend for order payments (not just rides) |
| Notifications | **NotificationService** | Add order-related notification types |
| File uploads | **UploadService** | Add product image category |
| Admin panel | **AdminController + adminRoutes** | Extend with order/product/merchant management |
| Merchant profile | **MerchantProfile** | Already has businessName, category, address, lat/lng |
| Monitoring | **Prometheus metrics** | Add marketplace-specific counters |

### What Needs Modification on Existing Models

| Model | Change |
|---|---|
| `Payment` | Already has `orderId` column ✅ - just need to use it |
| `MerchantProfile` | Add: `commissionRate`, `serviceFeeRate`, `pickupFeeRate`, `operatingHours`, `isOpen`, `coverImageUrl`, `description` |
| `NotificationType` enum | Add order-related types |
| `UploadCategory` | Add `products` category |
| `PromoCode` | Add: `applicableTo` (rides/orders/both), `categoryRestriction`, `minOrderValue`, `merchantId` |

---

## 3. New Database Tables

### 3.1 `products`

```
products
├── id                  UUID PK
├── merchantId          UUID FK → users.id
├── name                VARCHAR(255)
├── description         TEXT
├── category            ENUM (see below)
├── price               DECIMAL(10,2)
├── compareAtPrice      DECIMAL(10,2) NULL  -- strikethrough price
├── stockQuantity       INT DEFAULT 0
├── isActive            BOOLEAN DEFAULT true
├── images              TEXT[]               -- array of MinIO URLs
├── tags                TEXT[]
│
│   ── FOOD SPECIFIC ──
├── preparationTimeMin  INT NULL
│
│   ── PHARMACY SPECIFIC ──
├── expirationDate      DATE NULL
├── dosageInfo          TEXT NULL
├── prescriptionRequired BOOLEAN DEFAULT false
│
│   ── RENTALS SPECIFIC ──
├── rentalDuration      ENUM('hourly','daily','weekly') NULL
├── deposit             DECIMAL(10,2) NULL
│
│   ── SERVICES SPECIFIC ──
├── serviceDurationMin  INT NULL
│
├── createdAt           TIMESTAMP
├── updatedAt           TIMESTAMP
├── deletedAt           TIMESTAMP NULL       -- soft delete
```

### 3.2 `product_customizations` (food extras, options)

```
product_customizations
├── id                  UUID PK
├── productId           UUID FK → products.id (CASCADE)
├── title               VARCHAR(255)         -- e.g. "Choose Protein"
├── isRequired          BOOLEAN DEFAULT false
├── minSelections       INT DEFAULT 0
├── maxSelections       INT DEFAULT 1
├── sortOrder           INT DEFAULT 0
├── createdAt           TIMESTAMP
```

### 3.3 `customization_options`

```
customization_options
├── id                  UUID PK
├── customizationId     UUID FK → product_customizations.id (CASCADE)
├── name                VARCHAR(255)         -- e.g. "Chicken"
├── price               DECIMAL(10,2) DEFAULT 0
├── isDefault           BOOLEAN DEFAULT false
├── sortOrder           INT DEFAULT 0
```

### 3.4 `carts`

```
carts
├── id                  UUID PK
├── userId              UUID FK → users.id (UNIQUE)
├── merchantId          UUID FK → users.id NULL  -- single-merchant enforcement
├── subtotal            DECIMAL(12,2) DEFAULT 0
├── updatedAt           TIMESTAMP
```

### 3.5 `cart_items`

```
cart_items
├── id                  UUID PK
├── cartId              UUID FK → carts.id (CASCADE)
├── productId           UUID FK → products.id
├── quantity            INT DEFAULT 1
├── unitPrice           DECIMAL(10,2)
├── selectedOptions     JSONB NULL           -- [{customizationId, optionId, optionName, price}]
├── itemTotal           DECIMAL(10,2)        -- (unitPrice + options) * quantity
├── createdAt           TIMESTAMP
```

### 3.6 `orders`

```
orders
├── id                  UUID PK
├── orderNumber         VARCHAR(20) UNIQUE   -- "ORD-XXXX" human-readable
├── customerId          UUID FK → users.id
├── merchantId          UUID FK → users.id
├── driverId            UUID FK → users.id NULL
│
│   ── ITEMS SNAPSHOT ──
├── items               JSONB                -- frozen snapshot of cart items at checkout
│
│   ── MONEY ──
├── subtotal            DECIMAL(12,2)
├── serviceFee          DECIMAL(10,2)        -- platform service fee
├── commission          DECIMAL(10,2)        -- platform commission
├── deliveryFee         DECIMAL(10,2) DEFAULT 0
├── discountAmount      DECIMAL(10,2) DEFAULT 0
├── totalAmount         DECIMAL(12,2)
├── merchantEarnings    DECIMAL(12,2)        -- what merchant actually gets
│
│   ── PAYMENT ──
├── paymentMethod       ENUM('momo','card','cash','wallet')
├── paymentStatus       ENUM('pending','paid','escrowed','settled','refunded')
├── paymentReference    VARCHAR(255) NULL
│
│   ── DELIVERY ──
├── deliveryType        ENUM('delivery','pickup')
├── deliveryAddress     TEXT NULL
├── deliveryLat         DOUBLE PRECISION NULL
├── deliveryLng         DOUBLE PRECISION NULL
│
│   ── PICKUP ──
├── pickupCode          VARCHAR(6) NULL      -- 6-char alphanumeric
├── pickupCodeVerifiedAt TIMESTAMP NULL
│
│   ── STATUS ──
├── status              ENUM (see below)
├── cancelledBy         ENUM('customer','merchant','driver','system') NULL
├── cancellationReason  TEXT NULL
│
│   ── PROMO ──
├── promoCodeId         UUID FK → promo_codes.id NULL
│
│   ── NOTES ──
├── customerNote        TEXT NULL
├── merchantNote        TEXT NULL
│
│   ── TIMESTAMPS ──
├── createdAt           TIMESTAMP
├── acceptedAt          TIMESTAMP NULL
├── preparingAt         TIMESTAMP NULL
├── readyAt             TIMESTAMP NULL
├── pickedUpAt          TIMESTAMP NULL
├── deliveredAt         TIMESTAMP NULL
├── completedAt         TIMESTAMP NULL
├── cancelledAt         TIMESTAMP NULL
├── updatedAt           TIMESTAMP
```

### 3.7 `merchant_stats`

```
merchant_stats
├── id                  UUID PK
├── merchantId          UUID FK → users.id (UNIQUE)
├── totalOrders         INT DEFAULT 0
├── totalRevenue        DECIMAL(12,2) DEFAULT 0
├── averageRating       DECIMAL(3,2) DEFAULT 0
├── ratingCount         INT DEFAULT 0
├── totalProducts       INT DEFAULT 0
├── updatedAt           TIMESTAMP
```

### 3.8 `order_ratings` (separate from ride ratings)

```
order_ratings
├── id                  UUID PK
├── orderId             UUID FK → orders.id (UNIQUE)
├── customerId          UUID FK → users.id
├── merchantId          UUID FK → users.id
├── merchantRating      INT (1-5)
├── merchantComment     TEXT NULL
├── driverId            UUID FK → users.id NULL
├── driverRating        INT (1-5) NULL
├── driverComment       TEXT NULL
├── createdAt           TIMESTAMP
```

### 3.9 `platform_settings`

```
platform_settings
├── id                  UUID PK
├── country             VARCHAR(3) UNIQUE    -- 'GH','NG','IN','US','CA'
├── currency            VARCHAR(3)           -- 'GHS','NGN','INR','USD','CAD','EUR'
├── minimumOrderValue   DECIMAL(10,2)
├── defaultCommissionRate   DECIMAL(5,2)     -- e.g. 15.00
├── defaultServiceFeeRate   DECIMAL(5,2)     -- e.g. 8.00
├── defaultPickupFeeRate    DECIMAL(5,2)     -- e.g. 10.00
├── deliveryBaseFee     DECIMAL(10,2)
├── deliveryPerKmFee    DECIMAL(10,2)
├── isActive            BOOLEAN DEFAULT true
├── updatedAt           TIMESTAMP
```

### 3.10 `merchant_operating_hours`

```
merchant_operating_hours
├── id                  UUID PK
├── merchantId          UUID FK → users.id
├── dayOfWeek           INT (0=Sunday, 6=Saturday)
├── openTime            TIME
├── closeTime           TIME
├── isClosed            BOOLEAN DEFAULT false
```

### 3.11 `order_status_history` (audit trail)

```
order_status_history
├── id                  UUID PK
├── orderId             UUID FK → orders.id (CASCADE)
├── fromStatus          VARCHAR(50) NULL
├── toStatus            VARCHAR(50)
├── changedBy           UUID FK → users.id NULL
├── changedByRole       VARCHAR(20)          -- 'customer','merchant','driver','admin','system'
├── note                TEXT NULL
├── createdAt           TIMESTAMP
```

---

## 4. TypeORM Models to Create

New files in `src/models/`:

| File | Entity | Table |
|---|---|---|
| `product.ts` | `Product` | `products` |
| `product-customization.ts` | `ProductCustomization` | `product_customizations` |
| `customization-option.ts` | `CustomizationOption` | `customization_options` |
| `cart.ts` | `Cart` | `carts` |
| `cart-item.ts` | `CartItem` | `cart_items` |
| `order.ts` | `Order` | `orders` |
| `order-rating.ts` | `OrderRating` | `order_ratings` |
| `order-status-history.ts` | `OrderStatusHistory` | `order_status_history` |
| `merchant-stats.ts` | `MerchantStats` | `merchant_stats` |
| `platform-settings.ts` | `PlatformSettings` | `platform_settings` |
| `merchant-operating-hours.ts` | `MerchantOperatingHours` | `merchant_operating_hours` |

### Models to Modify

| File | Changes |
|---|---|
| `merchant-profile.ts` | Add `commissionRate`, `serviceFeeRate`, `pickupFeeRate`, `isOpen`, `coverImageUrl`, `description` |
| `notification.ts` | Add order-related `NotificationType` values |
| `promo-code.ts` | Add `applicableTo`, `categoryRestriction`, `minOrderValue`, `merchantId` |

---

## 5. New Enums & Types

### `ProductCategory`
```typescript
enum ProductCategory {
    FOOD = "food",
    GROCERY = "grocery",
    PHARMACY = "pharmacy",
    MARKETPLACE = "marketplace",  // general goods
    RENTALS = "rentals",
    SERVICES = "services",
}
```

### `OrderStatus`
```typescript
enum OrderStatus {
    PENDING = "pending",                    // order placed, awaiting merchant
    ACCEPTED = "accepted",                  // merchant accepted
    PREPARING = "preparing",                // merchant is preparing
    READY_FOR_PICKUP = "ready_for_pickup",  // ready (pickup or driver collection)
    DRIVER_ASSIGNED = "driver_assigned",    // delivery: driver assigned
    PICKED_UP = "picked_up",               // delivery: driver picked up from merchant
    IN_TRANSIT = "in_transit",              // delivery: driver en route to customer
    DELIVERED = "delivered",                // delivery: arrived at customer
    COMPLETED = "completed",               // order done (funds settled)
    CANCELLED = "cancelled",               // cancelled
    REFUNDED = "refunded",                 // refunded
}
```

### `OrderPaymentMethod`
```typescript
enum OrderPaymentMethod {
    MOMO = "momo",
    CARD = "card",
    CASH = "cash",
    WALLET = "wallet",
}
```

### `OrderPaymentStatus`
```typescript
enum OrderPaymentStatus {
    PENDING = "pending",
    PAID = "paid",
    ESCROWED = "escrowed",
    SETTLED = "settled",
    REFUNDED = "refunded",
}
```

### `DeliveryType`
```typescript
enum DeliveryType {
    DELIVERY = "delivery",
    PICKUP = "pickup",
}
```

### New `NotificationType` additions
```typescript
// Add to existing enum:
ORDER_PLACED = "order_placed",
ORDER_ACCEPTED = "order_accepted",
ORDER_REJECTED = "order_rejected",
ORDER_PREPARING = "order_preparing",
ORDER_READY = "order_ready",
ORDER_PICKED_UP = "order_picked_up",
ORDER_IN_TRANSIT = "order_in_transit",
ORDER_DELIVERED = "order_delivered",
ORDER_COMPLETED = "order_completed",
ORDER_CANCELLED = "order_cancelled",
PICKUP_CODE_GENERATED = "pickup_code_generated",
PICKUP_CODE_VERIFIED = "pickup_code_verified",
NEW_PRODUCT_REVIEW = "new_product_review",
PAYOUT_REQUESTED = "payout_requested",
PAYOUT_COMPLETED = "payout_completed",
MERCHANT_APPROVED = "merchant_approved",
MERCHANT_SUSPENDED = "merchant_suspended",
```

---

## 5.5 Multi-Country Readiness - Gap Analysis & Changes

### The Problem

The current codebase is **hardcoded to Ghana** in 6 critical places. To operate in multiple countries (GH, NG, US, CA, IN), every service that touches money, currency, or payment providers needs to resolve configuration from `platform_settings` via the user's country.

### 5.5.1 Hardcoded GHS Locations (must fix)

| File | Line | What's Hardcoded | Fix |
|---|---|---|---|
| `payment-service.ts` | L55 | `currency: "GHS"` in payment record creation | Resolve from `platform_settings` via user country |
| `payment-service.ts` | L97 | `currency: "GHS"` in momo payment initiation | Same - pass currency from caller |
| `wallet-service.ts` | L20 | `currency: "GHS"` in `createWallet()` | Resolve from user's country → `platform_settings.currency` |
| `paystack-provider.ts` | L50 | `request.currency \|\| "GHS"` fallback | Always require currency, no GHS fallback |
| `paystack-provider.ts` | L118 | `currency: "GHS"` in failed verify response | Use request currency, not hardcoded |
| `notification-service.ts` | L229 | `GHS ${fare}` in ride completed message | Resolve currency symbol from user's country |
| `notification-service.ts` | L237 | `GHS ${amount}` in payment received message | Same |
| `notification-service.ts` | L241 | `GHS ${amount}` in driver earnings message | Same |
| `payment-provider.interface.ts` | L6 | Comment says `// in GHS` | Update comment to `// in local currency` |

### 5.5.2 Model Changes Required

#### `User` - Add `country` column

```
users (ALTER)
├── country             VARCHAR(2) DEFAULT 'GH'   -- ISO 3166-1 alpha-2
```

This is the **anchor**. Every downstream service resolves currency, payment provider, and fee structure from `user.country` → `platform_settings`.

#### `VehiclePricing` - Add `country` column + rename `basePriceCedis`

```
vehicle_pricing (ALTER)
├── country             VARCHAR(2) DEFAULT 'GH'
├── basePrice           DECIMAL(8,2)              -- rename from basePriceCedis
```

Currently one global set of pricing. Needs per-country pricing so a bike ride in Ghana costs GHS 5 but in Nigeria costs NGN 500.
Drop the `UNIQUE` constraint on `vehicleType` alone → make it `UNIQUE(vehicleType, country)`.

#### `SurgeRule` - Add `country` column

```
surge_rules (ALTER)
├── country             VARCHAR(2) DEFAULT 'GH'
```

Surge rules need to be country-specific (peak hours differ by timezone/region).

#### `Ride` - Add `currency` column

```
rides (ALTER)
├── currency            VARCHAR(3) DEFAULT 'GHS'
```

Freeze the currency on the ride so historical rides show the correct currency even if settings change.

#### `Order` - Add `currency` column

```
orders (ALTER)
├── currency            VARCHAR(3) DEFAULT 'GHS'
```

Same - freeze currency at checkout time.

### 5.5.3 Payment Provider Strategy

Current: `PaymentService` hardcodes `new PaystackProvider()`.

Paystack supports: **GH, NG, ZA, KE, CI** - that's it. US/CA/IN need different providers.

**Solution: Provider Registry**

```typescript
// src/services/payment/payment-provider-registry.ts

interface ProviderConfig {
    provider: PaymentProvider;
    supportedMethods: PaymentMethodType[];
    smallestUnit: number;  // 100 for pesewas/kobo, 100 for cents
}

const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
    GH: { provider: new PaystackProvider(), supportedMethods: ["momo", "card", "cash", "wallet"], smallestUnit: 100 },
    NG: { provider: new PaystackProvider(), supportedMethods: ["card", "cash", "wallet"], smallestUnit: 100 },
    US: { provider: new StripeProvider(), supportedMethods: ["card", "wallet"], smallestUnit: 100 },
    CA: { provider: new StripeProvider(), supportedMethods: ["card", "wallet"], smallestUnit: 100 },
    IN: { provider: new RazorpayProvider(), supportedMethods: ["upi", "card", "wallet"], smallestUnit: 100 },
};

function getProviderForCountry(country: string): ProviderConfig { ... }
function getSupportedMethods(country: string): PaymentMethodType[] { ... }
```

**New files needed:**
| File | Purpose |
|---|---|
| `payment-provider-registry.ts` | Map country → provider + supported methods |
| `stripe-provider.ts` | Stripe implementation (US, CA, EU) |

> **Note:** `RazorpayProvider` (India) is Phase 3. For now, register it as a stub. Start with Paystack (GH/NG) + Stripe (US/CA).

### 5.5.4 PaymentMethodType - Expand

```typescript
enum PaymentMethodType {
    MOMO = "momo",           // GH, KE, CI
    CARD = "card",           // All countries
    CASH = "cash",           // GH, NG, IN
    WALLET = "wallet",       // All countries
    // Future:
    // UPI = "upi",          // IN
    // INTERAC = "interac",  // CA
}
```

Add `CARD` to `PaymentMethodType` - it's missing from the current enum but Paystack already supports card charges.

### 5.5.5 Service Changes Required

#### `PaymentService`

| Method | Current | Fix |
|---|---|---|
| `processRidePayment()` | Hardcodes `currency: "GHS"`, `new PaystackProvider()` | Accept `country` param → resolve currency from `platform_settings`, resolve provider from registry |
| `processMomoPayment()` | Hardcodes `currency: "GHS"` in request | Pass currency from caller |
| `processOrderPayment()` | (new - not built yet) | Build country-aware from day one |
| `creditDriverEarnings()` | Hardcodes 80/20 split | Read commission from `platform_settings` or merchant override |
| constructor | `this.provider = new PaystackProvider()` | Remove - resolve per-call from registry |

#### `WalletService`

| Method | Current | Fix |
|---|---|---|
| `createWallet()` | `currency: "GHS"` | Accept `country` param → resolve currency from `platform_settings` |

#### `FareService`

| Method | Current | Fix |
|---|---|---|
| `calculateFare()` | Reads from global `vehicle_pricing` table (no country filter) | Filter `vehicle_pricing` by country |
| `getVehiclePricing()` | Returns all pricing, orders by `basePriceCedis` | Filter by country, rename field |
| `getSurgeMultiplier()` | Reads all surge rules globally | Filter by country |

#### `NotificationService`

| Method | Current | Fix |
|---|---|---|
| `notifyRideCompleted()` | `GHS ${fare}` | Accept currency param → use currency symbol map |
| `notifyPaymentReceived()` | `GHS ${amount}` | Same |
| `notifyDriverEarnings()` | `GHS ${amount}` | Same |

**Currency symbol helper:**

```typescript
// src/utils/currency.ts
const CURRENCY_SYMBOLS: Record<string, string> = {
    GHS: "GHS", NGN: "₦", USD: "$", CAD: "CA$", INR: "₹", EUR: "€",
};
export function formatCurrency(amount: number, currencyCode: string): string {
    return `${CURRENCY_SYMBOLS[currencyCode] || currencyCode} ${amount.toFixed(2)}`;
}
```

### 5.5.6 Momo Provider Detection

`PaystackProvider.detectMomoProvider()` currently only handles Ghana prefixes (024→MTN, 020→Voda, 027→AirtelTigo). This needs to become country-aware:

- **Ghana:** MTN, Vodafone, AirtelTigo (current logic)
- **Nigeria:** No momo via Paystack (card only)
- **Kenya:** M-Pesa
- **Côte d'Ivoire:** MTN, Orange

Move the detection logic to accept country as a param, or let each provider implementation handle its own phone prefix mapping.

### 5.5.7 Migration Required

```sql
-- Add country to users
ALTER TABLE "users" ADD COLUMN "country" VARCHAR(2) NOT NULL DEFAULT 'GH';

-- Add country to vehicle_pricing + rename column
ALTER TABLE "vehicle_pricing" ADD COLUMN "country" VARCHAR(2) NOT NULL DEFAULT 'GH';
ALTER TABLE "vehicle_pricing" RENAME COLUMN "basePriceCedis" TO "basePrice";
ALTER TABLE "vehicle_pricing" DROP CONSTRAINT IF EXISTS "UQ_vehicle_pricing_vehicleType";
CREATE UNIQUE INDEX "UQ_vehicle_pricing_type_country" ON "vehicle_pricing" ("vehicleType", "country");

-- Add country to surge_rules
ALTER TABLE "surge_rules" ADD COLUMN "country" VARCHAR(2) NOT NULL DEFAULT 'GH';

-- Add currency to rides
ALTER TABLE "rides" ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'GHS';

-- Add currency to orders
ALTER TABLE "orders" ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'GHS';

-- Add CARD to payment method enum
ALTER TYPE "payment_method_enum" ADD VALUE IF NOT EXISTS 'card';
```

### 5.5.8 How It All Connects

```
User signs up → country set (from phone prefix or onboarding)
                     │
                     ▼
         ┌─── platform_settings ───┐
         │  country: "GH"          │
         │  currency: "GHS"        │
         │  commissionRate: 15%    │
         │  deliveryBaseFee: 5.00  │
         │  MOV: 50.00             │
         └────────┬────────────────┘
                  │
    ┌─────────────┼─────────────────┐
    ▼             ▼                 ▼
 Wallet       Payment           Fare/Order
 created     Provider           calculations
 in GHS      = Paystack         use GH pricing
              (momo+card)       & GH surge rules
```

### 5.5.9 What We Do NOW vs Later

| Task | When | Why |
|---|---|---|
| Add `country` to `User` model | **Now (Phase 2A+)** | Anchor point - everything else depends on this |
| Add `currency` to `Order` model | **Now** | New model, build it right |
| Add `currency` to `Ride` model | **Now** | One column, cheap |
| Add `country` to `VehiclePricing` + rename column | **Now** | Needed before rides go multi-country |
| Add `country` to `SurgeRule` | **Now** | Same |
| Create `payment-provider-registry.ts` | **Now** | So new `OrderService` uses it from day one |
| Create `currency.ts` util | **Now** | Tiny file, used everywhere |
| Add `CARD` to `PaymentMethodType` | **Now** | Missing, needed for Paystack card + Stripe |
| Refactor `PaymentService.processRidePayment()` | **Now** | Remove GHS hardcoding |
| Refactor `WalletService.createWallet()` | **Now** | Remove GHS hardcoding |
| Refactor `FareService` country filter | **Now** | Filter pricing/surge by country |
| Refactor `NotificationService` currency | **Now** | Use currency symbol helper |
| Create `StripeProvider` | **Later (Phase 3)** | Not launching in US/CA yet |
| Create `RazorpayProvider` | **Later (Phase 3)** | Not launching in India yet |
| Multi-currency wallets | **Later (Phase 3)** | Complex - currency conversion, etc. |

---

## 6. API Endpoints & Response Contracts

### 6.1 Product APIs (`/api/v1/products`)

#### `GET /api/v1/products?merchantId=&category=&search=&page=&limit=`
**Public - no auth required**

```json
// Response 200
{
  "products": [
    {
      "id": "uuid",
      "name": "Jollof Rice",
      "description": "...",
      "category": "food",
      "price": 35.00,
      "compareAtPrice": 40.00,
      "images": ["https://minio.../img1.jpg"],
      "tags": ["spicy", "rice"],
      "stockQuantity": 50,
      "preparationTimeMin": 25,
      "merchant": {
        "id": "uuid",
        "businessName": "Mama's Kitchen",
        "category": "food",
        "isOpen": true,
        "averageRating": 4.5,
        "latitude": 5.603717,
        "longitude": -0.186964
      },
      "customizations": [
        {
          "id": "uuid",
          "title": "Choose Protein",
          "isRequired": true,
          "maxSelections": 1,
          "options": [
            { "id": "uuid", "name": "Chicken", "price": 10.00 },
            { "id": "uuid", "name": "Fish", "price": 12.00 }
          ]
        }
      ]
    }
  ],
  "total": 120,
  "page": 1,
  "limit": 20
}
```

#### `GET /api/v1/products/:id`
**Public**

Returns single product with full customizations.

#### `POST /api/v1/products` (Merchant only)
**Auth: `x-user-phone` + merchant role**

```json
// Request
{
  "name": "Jollof Rice",
  "description": "Delicious spicy jollof",
  "category": "food",
  "price": 35.00,
  "stockQuantity": 50,
  "tags": ["spicy", "rice"],
  "preparationTimeMin": 25,
  "customizations": [
    {
      "title": "Choose Protein",
      "isRequired": true,
      "maxSelections": 1,
      "options": [
        { "name": "Chicken", "price": 10.00 },
        { "name": "Fish", "price": 12.00 }
      ]
    }
  ]
}

// Response 201
{
  "message": "Product created",
  "product": { ... }
}
```

#### `PUT /api/v1/products/:id` (Merchant only)
#### `DELETE /api/v1/products/:id` (Merchant only - soft delete)
#### `POST /api/v1/products/:id/images` (Merchant only - multipart upload to MinIO)

---

### 6.2 Cart APIs (`/api/v1/cart`)

#### `GET /api/v1/cart`
**Auth required**

```json
// Response 200
{
  "cart": {
    "id": "uuid",
    "merchantId": "uuid",
    "merchant": {
      "businessName": "Mama's Kitchen",
      "category": "food"
    },
    "items": [
      {
        "id": "uuid",
        "productId": "uuid",
        "productName": "Jollof Rice",
        "productImage": "https://...",
        "quantity": 2,
        "unitPrice": 35.00,
        "selectedOptions": [
          { "optionName": "Chicken", "price": 10.00 }
        ],
        "itemTotal": 90.00
      }
    ],
    "subtotal": 90.00,
    "itemCount": 2
  }
}
```

#### `POST /api/v1/cart/add`
**Auth required**

```json
// Request
{
  "productId": "uuid",
  "quantity": 1,
  "selectedOptions": [
    { "customizationId": "uuid", "optionId": "uuid" }
  ]
}

// Response 200
{ "message": "Item added to cart", "cart": { ... } }

// Response 409 (different merchant)
{
  "success": false,
  "message": "You can only order from one merchant at a time",
  "currentMerchant": "Mama's Kitchen",
  "newMerchant": "Uncle John's Pharmacy"
}
```

#### `PATCH /api/v1/cart/items/:itemId`
```json
// Request
{ "quantity": 3 }
```

#### `DELETE /api/v1/cart/items/:itemId`
#### `DELETE /api/v1/cart` (clear entire cart)

---

### 6.3 Order APIs (`/api/v1/orders`)

#### `POST /api/v1/orders/quote`
**Auth required - get price breakdown before checkout**

```json
// Request
{
  "deliveryType": "delivery",
  "deliveryLat": 5.603717,
  "deliveryLng": -0.186964,
  "deliveryAddress": "123 Main St, Accra",
  "promoCode": "SAVE10"
}

// Response 200
{
  "quote": {
    "subtotal": 90.00,
    "serviceFee": 7.20,
    "commission": 13.50,
    "deliveryFee": 15.00,
    "discount": 10.00,
    "totalAmount": 115.70,
    "merchantEarnings": 69.30,
    "currency": "GHS",
    "estimatedDeliveryMin": 35
  }
}

// Response 400 (below MOV)
{
  "success": false,
  "message": "Add GHS 12.00 more to unlock delivery",
  "minimumOrderValue": 50.00,
  "currentSubtotal": 38.00,
  "remainingAmount": 12.00
}
```

#### `POST /api/v1/orders/checkout`
**Auth required**

```json
// Request
{
  "deliveryType": "delivery",
  "deliveryAddress": "123 Main St, Accra",
  "deliveryLat": 5.603717,
  "deliveryLng": -0.186964,
  "paymentMethod": "momo",
  "promoCode": "SAVE10",
  "customerNote": "No onions please",
  "phoneNumber": "+233241234567"
}

// Response 201
{
  "message": "Order placed successfully",
  "order": {
    "id": "uuid",
    "orderNumber": "ORD-A1B2C3",
    "status": "pending",
    "totalAmount": 115.70,
    "paymentStatus": "pending",
    "pickupCode": null,
    "estimatedDeliveryMin": 35
  },
  "payment": {
    "reference": "ORD-xxxxxxxxxxxx",
    "authorizationUrl": "https://paystack.com/...",
    "status": "pending"
  }
}
```

#### `GET /api/v1/orders` (Customer - my orders)
```json
// Response 200
{
  "orders": [
    {
      "id": "uuid",
      "orderNumber": "ORD-A1B2C3",
      "status": "preparing",
      "totalAmount": 115.70,
      "deliveryType": "delivery",
      "merchantName": "Mama's Kitchen",
      "itemCount": 3,
      "createdAt": "2026-03-11T10:30:00Z"
    }
  ],
  "total": 15,
  "page": 1
}
```

#### `GET /api/v1/orders/:id` (Detailed order view)
Full order with items, status history, driver info, payment info.

#### `POST /api/v1/orders/:id/cancel` (Customer cancel)
```json
// Request
{ "reason": "Changed my mind" }
```

---

### 6.4 Merchant Order APIs (`/api/v1/merchant`)

#### `GET /api/v1/merchant/orders?status=pending&page=1`
**Auth: merchant role**

```json
{
  "orders": [
    {
      "id": "uuid",
      "orderNumber": "ORD-A1B2C3",
      "status": "pending",
      "items": [ ... ],
      "subtotal": 90.00,
      "merchantEarnings": 69.30,
      "deliveryType": "pickup",
      "customerNote": "No onions",
      "customerName": "Kwame A.",
      "createdAt": "2026-03-11T10:30:00Z"
    }
  ]
}
```

#### `PATCH /api/v1/merchant/orders/:id/accept`
```json
// Response 200
{
  "message": "Order accepted",
  "order": { "id": "uuid", "status": "accepted" },
  "pickupCode": "A7K3M2"  // only for pickup orders
}
```

#### `PATCH /api/v1/merchant/orders/:id/reject`
```json
// Request
{ "reason": "Out of stock" }
```

#### `PATCH /api/v1/merchant/orders/:id/status`
```json
// Request
{ "status": "preparing" }
// Allowed transitions: accepted → preparing → ready_for_pickup
```

#### `POST /api/v1/merchant/orders/:id/verify-pickup`
```json
// Request
{ "pickupCode": "A7K3M2" }

// Response 200
{
  "message": "Pickup verified! Order completed.",
  "order": { "id": "uuid", "status": "completed" },
  "settlement": {
    "merchantEarnings": 69.30,
    "platformFee": 20.70,
    "walletCredited": true
  }
}

// Response 400
{ "message": "Invalid pickup code" }
```

#### `GET /api/v1/merchant/dashboard`
```json
{
  "stats": {
    "totalOrders": 245,
    "todayOrders": 12,
    "totalRevenue": 15420.50,
    "todayRevenue": 890.00,
    "averageRating": 4.6,
    "ratingCount": 180,
    "pendingOrders": 3
  },
  "recentOrders": [ ... ]
}
```

#### `GET /api/v1/merchant/finances`
```json
{
  "wallet": {
    "balance": 2340.50,
    "currency": "GHS"
  },
  "earnings": {
    "today": 890.00,
    "thisWeek": 3200.00,
    "thisMonth": 15420.50
  },
  "recentTransactions": [ ... ],
  "payoutThreshold": 100.00,
  "canRequestPayout": true
}
```

#### `POST /api/v1/merchant/request-payout`
```json
// Request
{
  "amount": 500.00,
  "payoutMethod": "momo",
  "accountNumber": "+233241234567"
}
```

---

### 6.5 Driver Delivery APIs (`/api/v1/driver`)

> Extend existing driver routes.

#### `GET /api/v1/driver/available-deliveries`
Returns nearby orders with status `ready_for_pickup` + `deliveryType = delivery`.

```json
{
  "deliveries": [
    {
      "orderId": "uuid",
      "orderNumber": "ORD-A1B2C3",
      "merchantName": "Mama's Kitchen",
      "merchantLat": 5.603717,
      "merchantLng": -0.186964,
      "deliveryAddress": "123 Main St",
      "deliveryLat": 5.620000,
      "deliveryLng": -0.190000,
      "estimatedDistanceKm": 3.2,
      "deliveryFee": 15.00,
      "itemCount": 3
    }
  ]
}
```

#### `POST /api/v1/driver/accept-delivery/:orderId`
#### `PATCH /api/v1/driver/delivery/:orderId/status`
```json
// Request - driver updates delivery status
{ "status": "picked_up" }
// Allowed: driver_assigned → picked_up → in_transit → delivered
```

#### `PATCH /api/v1/driver/delivery/:orderId/complete`
Triggers settlement for delivery orders.

---

### 6.6 Search & Discovery (`/api/v1/search`)

#### `GET /api/v1/search?q=chicken&category=food&lat=5.6&lng=-0.18&radius=10`

```json
{
  "merchants": [
    {
      "id": "uuid",
      "businessName": "Mama's Kitchen",
      "category": "food",
      "distance": 1.2,
      "averageRating": 4.5,
      "isOpen": true,
      "coverImageUrl": "https://..."
    }
  ],
  "products": [
    {
      "id": "uuid",
      "name": "Jollof Rice",
      "price": 35.00,
      "merchantName": "Mama's Kitchen",
      "image": "https://..."
    }
  ]
}
```

---

## 7. Services to Create

| File | Service | Purpose |
|---|---|---|
| `product-service.ts` | `ProductService` | CRUD products, customizations, images, stock management |
| `cart-service.ts` | `CartService` | Cart operations, single-merchant enforcement, subtotal calc |
| `order-service.ts` | `OrderService` | Order lifecycle, status transitions, quote generation, checkout |
| `settlement-service.ts` | `SettlementService` | Cash deductions, escrow release, merchant credits |
| `merchant-service.ts` | `MerchantService` | Dashboard stats, finances, operating hours, payout requests |
| `search-service.ts` | `SearchService` | Product/merchant search with location-based filtering |
| `pickup-code-service.ts` | `PickupCodeService` | Generate & verify 6-char alphanumeric codes |
| `delivery-fee-service.ts` | `DeliveryFeeService` | Calculate delivery fees based on distance + platform settings |

### Services to Extend

| Service | New Methods |
|---|---|
| `PaymentService` | `processOrderPayment()` - reuse Paystack/wallet/cash flow for orders |
| `WalletService` | No changes needed - credit/debit already generic ✅ |
| `NotificationService` | No structural changes - just use new `NotificationType` values |
| `UploadService` | Add `"products"` to `UploadCategory` type |

---

## 8. Admin Back-Office Endpoints

### New Admin Endpoints (`/api/v1/admin`)

| Method | Path | Description |
|---|---|---|
| **Orders** | | |
| GET | `/admin/orders?status=&merchant=&page=` | List all orders (filterable) |
| GET | `/admin/orders/:id` | Detailed order view with full history |
| PATCH | `/admin/orders/:id/status` | Override order status (support escalation) |
| POST | `/admin/orders/:id/refund` | Process refund |
| POST | `/admin/orders/:id/cancel` | Admin force-cancel |
| **Products** | | |
| GET | `/admin/products?merchant=&category=` | List all products |
| PATCH | `/admin/products/:id` | Suspend/reactivate product |
| DELETE | `/admin/products/:id` | Remove product |
| **Merchants** | | |
| GET | `/admin/merchants/:id/details` | Full merchant profile + stats + products |
| PATCH | `/admin/merchants/:id/rates` | Update commission/fee rates |
| POST | `/admin/merchants/:id/suspend` | Suspend merchant |
| POST | `/admin/merchants/:id/approve` | Approve merchant application |
| GET | `/admin/merchants/:id/orders` | Merchant's order history |
| GET | `/admin/merchants/:id/finances` | Merchant financial summary |
| **Platform Config** | | |
| GET | `/admin/settings` | List platform settings (all countries) |
| PUT | `/admin/settings/:country` | Update country config (MOV, fees, etc.) |
| **Dashboard** | | |
| GET | `/admin/dashboard` | System-wide stats |
| GET | `/admin/reports/revenue?from=&to=` | Revenue reports |
| GET | `/admin/reports/orders?from=&to=` | Order volume reports |
| **Payouts** | | |
| GET | `/admin/payouts?status=pending` | List payout requests |
| PATCH | `/admin/payouts/:id/approve` | Approve payout |
| PATCH | `/admin/payouts/:id/reject` | Reject payout |
| **Support** | | |
| POST | `/admin/orders/:id/assign-driver` | Manually assign a driver |
| POST | `/admin/orders/:id/reassign-driver` | Reassign driver |
| POST | `/admin/users/:id/credit-wallet` | Credit user wallet (goodwill) |
| POST | `/admin/users/:id/debit-wallet` | Debit user wallet (correction) |

### Admin Dashboard Response
```json
// GET /admin/dashboard
{
  "overview": {
    "totalUsers": 5420,
    "totalMerchants": 145,
    "totalDrivers": 320,
    "activeMerchants": 98,
    "activeDrivers": 187
  },
  "today": {
    "totalOrders": 245,
    "totalRides": 1200,
    "orderRevenue": 12500.00,
    "rideRevenue": 45000.00,
    "platformFees": 8750.00
  },
  "pendingActions": {
    "pendingMerchantApprovals": 5,
    "pendingDriverApprovals": 12,
    "pendingPayouts": 8,
    "openDisputes": 3
  }
}
```

---

## 9. Cash Settlement & Wallet Logic

### 9.1 Delivery Order - Cash Payment

Driver collects cash from customer.

```
On order completion (driver confirms delivered):
  1. merchantAmount = subtotal - commission - serviceFee
  2. platformFee = commission + serviceFee
  
  3. DEBIT driver.wallet  → (merchantAmount + platformFee)
     Description: "Cash settlement: Order ORD-A1B2C3"
     
  4. CREDIT merchant.wallet → merchantAmount
     Description: "Earnings: Order ORD-A1B2C3"
     
  5. Platform keeps platformFee (already deducted from driver)
```

### 9.2 Pickup Order - Cash Payment

Merchant collects cash from customer.

```
On pickup code verification:
  1. platformFee = subtotal * pickupFeeRate (e.g. 10%)
  
  2. DEBIT merchant.wallet → platformFee
     Description: "Pickup fee: Order ORD-A1B2C3"
```

### 9.3 Online Payment (Momo/Card) - Delivery

```
On checkout:
  1. Charge customer via Paystack → funds held by platform (escrowed)
  
On order completion:
  2. merchantAmount = subtotal - commission - serviceFee
  3. driverAmount = deliveryFee
  
  4. CREDIT merchant.wallet → merchantAmount
  5. CREDIT driver.wallet   → driverAmount
  6. Platform retains: commission + serviceFee
```

### 9.4 Online Payment (Momo/Card) - Pickup

```
On checkout:
  1. Charge customer via Paystack
  
On pickup code verification:
  2. merchantAmount = subtotal - platformFee
  
  3. CREDIT merchant.wallet → merchantAmount
  4. Platform retains: platformFee
```

### 9.5 Wallet Transaction Metadata

Every wallet transaction should carry metadata for audit:

```json
{
  "orderId": "uuid",
  "orderNumber": "ORD-A1B2C3",
  "settlementType": "cash_delivery" | "cash_pickup" | "online_delivery" | "online_pickup",
  "breakdown": {
    "subtotal": 90.00,
    "commission": 13.50,
    "serviceFee": 7.20,
    "deliveryFee": 15.00
  }
}
```

---

## 10. Infrastructure - Redis & MinIO Usage

### Redis (Already deployed - no changes needed)

| Use Case | Key Pattern | TTL | Purpose |
|---|---|---|---|
| Cart session cache | `cart:{userId}` | 24h | Fast cart reads, reduce DB load |
| Order lock | `order:lock:{orderId}` | 30s | Prevent double-accept by merchants |
| Pickup code attempts | `pickup:attempts:{orderId}` | 1h | Rate-limit verification attempts (max 5) |
| Merchant online status | `merchant:status:{merchantId}` | 5min | Is merchant currently accepting orders |
| Search cache | `search:{hash}` | 5min | Cache popular search results |
| Order count today | `merchant:orders:today:{merchantId}` | expire at midnight | Dashboard quick stats |
| Rate limiting | `ratelimit:{ip}:{endpoint}` | 1min | API rate limiting |

> **Current Redis config:** 128MB, allkeys-lru, no persistence.
> This is fine for caching. Cart data is also persisted in PostgreSQL, Redis is just a fast layer.

### MinIO (Already deployed - no changes needed)

| Use Case | Bucket | Prefix | Purpose |
|---|---|---|---|
| **Existing** | `velo-uploads` | `id-cards/` | ID verification images |
| **Existing** | `velo-uploads` | `licenses/` | Driver license photos |
| **Existing** | `velo-uploads` | `registration/` | Business registration docs |
| **Existing** | `velo-uploads` | `avatars/` | Profile photos |
| **New** | `velo-uploads` | `products/` | Product images |
| **New** | `velo-uploads` | `merchants/` | Merchant cover images, logos |

> **Action:** Add `"products"` and `"merchants"` to the `UploadCategory` type in `upload-service.ts`.
> **No bucket creation needed** - same `velo-uploads` bucket, just new prefixes.

---

## 11. K8s / Deployment Impact

### No infrastructure changes needed ✅

| Component | Status | Notes |
|---|---|---|
| PostgreSQL | ✅ No changes | TypeORM `synchronize: true` auto-creates new tables |
| Redis | ✅ No changes | 128MB is enough for caching layer |
| MinIO | ✅ No changes | 20Gi PVC, same bucket, new prefixes |
| API Deployment | ✅ No changes | Same image, same 2 replicas |
| ConfigMap | ✅ No changes | No new env vars needed |
| Secrets | ✅ No changes | Paystack key already configured |
| Nginx | ✅ No changes | Already proxies all `/api/v1/*` routes |

### What to Monitor (add to Prometheus)

```typescript
// New metrics to add in src/utils/metrics.ts
const orderEventsTotal = new Counter({ name: 'order_events_total', help: '...', labelNames: ['status', 'type'] });
const cartEventsTotal = new Counter({ name: 'cart_events_total', help: '...', labelNames: ['action'] });
const settlementEventsTotal = new Counter({ name: 'settlement_events_total', help: '...', labelNames: ['type', 'method'] });
const merchantSearchTotal = new Counter({ name: 'merchant_search_total', help: '...' });
const productViewsTotal = new Counter({ name: 'product_views_total', help: '...', labelNames: ['category'] });
```

---

## 12. Migration & Rollout Strategy

### Database Migration

Since we use `synchronize: true`, TypeORM will auto-create new tables on startup. For the **MerchantProfile** column additions, TypeORM will also auto-add them.

However, we need **seed data** for:

1. **`platform_settings`** - Insert rows for GH, NG, etc.
2. **`roles`** - Admin role already exists ✅

### Seed Script (`src/scripts/seed-platform-settings.ts`)

```typescript
// Country configs to seed
const settings = [
  { country: "GH", currency: "GHS", minimumOrderValue: 50,   defaultCommissionRate: 15, defaultServiceFeeRate: 8, defaultPickupFeeRate: 10, deliveryBaseFee: 5, deliveryPerKmFee: 2 },
  { country: "NG", currency: "NGN", minimumOrderValue: 5000,  defaultCommissionRate: 15, defaultServiceFeeRate: 8, defaultPickupFeeRate: 10, deliveryBaseFee: 500, deliveryPerKmFee: 150 },
  { country: "US", currency: "USD", minimumOrderValue: 25,    defaultCommissionRate: 15, defaultServiceFeeRate: 8, defaultPickupFeeRate: 10, deliveryBaseFee: 3, deliveryPerKmFee: 1.5 },
  { country: "CA", currency: "CAD", minimumOrderValue: 25,    defaultCommissionRate: 15, defaultServiceFeeRate: 8, defaultPickupFeeRate: 10, deliveryBaseFee: 3.5, deliveryPerKmFee: 1.5 },
  { country: "IN", currency: "INR", minimumOrderValue: 500,   defaultCommissionRate: 15, defaultServiceFeeRate: 8, defaultPickupFeeRate: 10, deliveryBaseFee: 30, deliveryPerKmFee: 10 },
];
```

---

## 13. Implementation Phases

### Phase 2A - Foundation (Week 1-2)

1. ☐ Create all new TypeORM models (11 new entities)
2. ☐ Modify existing models (MerchantProfile, Notification, PromoCode, UploadCategory)
3. ☐ Create `PlatformSettings` seed script
4. ☐ Add new Prometheus metrics
5. ☐ Add `products` and `merchants` upload categories
6. ☐ Deploy & verify tables are created

### Phase 2A+ - Multi-Country Readiness (Week 2)

1. ☐ Add `country` to User, VehiclePricing, SurgeRule models
2. ☐ Add `currency` to Ride, Order models
3. ☐ Rename `basePriceCedis` → `basePrice` in VehiclePricing
4. ☐ Add `CARD` to PaymentMethodType enum
5. ☐ Create migration `AddMultiCountrySupport`
6. ☐ Create `src/utils/currency.ts` (symbol map + `formatCurrency()`)
7. ☐ Create `src/services/payment/payment-provider-registry.ts`
8. ☐ Refactor `PaymentService` - remove GHS hardcoding, use provider registry
9. ☐ Refactor `WalletService.createWallet()` - currency from country
10. ☐ Refactor `FareService` - filter pricing/surge by country
11. ☐ Refactor `NotificationService` - use `formatCurrency()` helper

### Phase 2B - Products & Merchant (Week 2-3)

1. ☐ `ProductService` - full CRUD with customizations
2. ☐ `ProductController` + routes
3. ☐ Product image upload (multipart → MinIO)
4. ☐ `MerchantService` - dashboard, operating hours, stats
5. ☐ `MerchantController` + routes
6. ☐ `SearchService` - product/merchant search + location filter

### Phase 2C - Cart & Checkout (Week 3-4)

1. ☐ `CartService` - add/remove/update, single-merchant enforcement, Redis caching
2. ☐ `CartController` + routes
3. ☐ `OrderService` - quote, checkout, status transitions
4. ☐ `OrderController` + routes
5. ☐ `PickupCodeService` - generate & verify codes
6. ☐ `DeliveryFeeService` - distance-based delivery fee calculation
7. ☐ Extend `PaymentService` for order payments

### Phase 2D - Settlement & Delivery (Week 4-5)

1. ☐ `SettlementService` - all 4 settlement flows
2. ☐ Driver delivery acceptance + status updates
3. ☐ Pickup code verification → settlement trigger
4. ☐ Order completion → wallet credits/debits
5. ☐ `OrderRating` flow
6. ☐ Order-related notifications (merchant, customer, driver)

### Phase 2E - Admin Back-Office (Week 5-6)

1. ☐ Extend `AdminController` with all new endpoints
2. ☐ Admin dashboard aggregations
3. ☐ Order management (view, override status, refund, cancel)
4. ☐ Merchant management (approve, suspend, update rates)
5. ☐ Payout management (approve, reject)
6. ☐ Platform settings management
7. ☐ Revenue & order reports

### Phase 2F - Polish & Testing (Week 6-7)

1. ☐ Swagger documentation for all new endpoints
2. ☐ Edge cases: stock management, out-of-stock handling
3. ☐ Rate limiting on cart/checkout endpoints (Redis)
4. ☐ Order status history audit trail
5. ☐ Load testing
6. ☐ Production deployment

---

## File Structure (New Files)

```
src/
├── models/
│   ├── product.ts                    ← NEW
│   ├── product-customization.ts      ← NEW
│   ├── customization-option.ts       ← NEW
│   ├── cart.ts                       ← NEW
│   ├── cart-item.ts                  ← NEW
│   ├── order.ts                      ← NEW
│   ├── order-rating.ts              ← NEW
│   ├── order-status-history.ts      ← NEW
│   ├── merchant-stats.ts            ← NEW
│   ├── platform-settings.ts         ← NEW
│   ├── merchant-operating-hours.ts  ← NEW
│   ├── merchant-profile.ts          ← MODIFY (add columns)
│   ├── notification.ts              ← MODIFY (add enum values)
│   ├── promo-code.ts                ← MODIFY (add columns)
│   ├── user.ts                      ← MODIFY (add country)
│   ├── vehicle-pricing.ts           ← MODIFY (add country, rename basePriceCedis)
│   ├── surge-rule.ts                ← MODIFY (add country)
│   ├── ride.ts                      ← MODIFY (add currency)
│   ├── payment.ts                   ← MODIFY (add CARD to enum)
│   └── ... (existing unchanged)
│
├── controllers/
│   ├── ProductController.ts          ← NEW
│   ├── CartController.ts             ← NEW
│   ├── MarketplaceOrderController.ts ← NEW
│   ├── MerchantController.ts         ← NEW
│   ├── SearchController.ts           ← NEW
│   ├── AdminController.ts            ← MODIFY (extend)
│   └── ... (existing unchanged)
│
├── services/
│   ├── product-service.ts            ← NEW
│   ├── cart-service.ts               ← NEW
│   ├── order-service.ts              ← NEW
│   ├── settlement-service.ts         ← NEW
│   ├── merchant-service.ts           ← NEW
│   ├── search-service.ts             ← NEW
│   ├── pickup-code-service.ts        ← NEW
│   ├── delivery-fee-service.ts       ← NEW
│   ├── upload-service.ts             ← MODIFY (add categories)
│   ├── wallet-service.ts             ← MODIFY (country-aware createWallet)
│   ├── fare-service.ts               ← MODIFY (filter by country)
│   ├── notification-service.ts       ← MODIFY (use formatCurrency)
│   ├── payment/
│   │   ├── payment-service.ts        ← MODIFY (provider registry, remove GHS)
│   │   ├── payment-provider-registry.ts ← NEW
│   │   ├── paystack-provider.ts      ← MODIFY (country-aware momo detection)
│   │   └── payment-provider.interface.ts ← MODIFY (update comment)
│   └── ... (existing unchanged)
│
├── utils/
│   └── currency.ts                   ← NEW (symbol map + formatCurrency)
│
├── routes/
│   ├── productRoutes.ts              ← NEW
│   ├── cartRoutes.ts                 ← NEW
│   ├── marketplaceOrderRoutes.ts     ← NEW
│   ├── merchantRoutes.ts             ← NEW
│   ├── searchRoutes.ts               ← NEW
│   ├── adminRoutes.ts                ← MODIFY (add endpoints)
│   └── ... (existing unchanged)
│
├── scripts/
│   └── seed-platform-settings.ts     ← NEW
│
└── index.ts                          ← MODIFY (register new routes)
```

---

## Summary

| Metric | Count |
|---|---|
| New TypeORM entities | 11 |
| Modified entities (marketplace) | 3 |
| Modified entities (multi-country) | 5 (User, VehiclePricing, SurgeRule, Ride, Payment) |
| New API route files | 5 |
| New service files | 8 + 1 (provider registry) |
| New util files | 1 (currency.ts) |
| New controller files | 5 |
| Modified controllers | 1 |
| Refactored services | 4 (Payment, Wallet, Fare, Notification) |
| New admin endpoints | ~20 |
| New customer/merchant endpoints | ~25 |
| Infrastructure changes | **0** |
| New env vars | **0** (Stripe key added later Phase 3) |
| K8s manifest changes | **0** |

**Bottom line:** This is purely a code addition. No infrastructure, no new secrets, no K8s changes. Redis and MinIO are already deployed and ready. PostgreSQL auto-syncs via TypeORM. Ship it. 🚀
