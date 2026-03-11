# 🏪 Marketplace Sprint — Progress Tracker

> **Started:** 11 March 2026  
> **Branch:** `new-tables`

---

## Phase 2A — Foundation

- [x] Create all 11 new TypeORM models
- [x] Modify `MerchantProfile` (description, coverImageUrl, isOpen, commission/service/pickup rates)
- [x] Modify `Notification` (17 new enum values)
- [x] Modify `PromoCode` (applicableTo, categoryRestriction, minOrderValue, merchantId)
- [x] Add `products` & `merchants` to `UploadService` categories
- [x] Create migration file (`CreateMarketplaceTables`)
- [x] Fix data-source migrations path
- [x] Seed script for `platform_settings`
- [x] Add new Prometheus metrics (orders, carts, settlements, search, product views)
- [ ] Deploy & verify tables created

## Phase 2A+ — Multi-Country Readiness

### Model Changes
- [x] Add `country` column to `User` model (VARCHAR 2, default `'GH'`)
- [x] Add `country` column to `VehiclePricing` model + rename `basePriceCedis` → `basePrice`
- [x] Drop unique on `vehicleType` alone → unique on `(vehicleType, country)`
- [x] Add `country` column to `SurgeRule` model
- [x] Add `currency` column to `Ride` model (VARCHAR 3, default `'GHS'`)
- [x] Add `currency` column to `Order` model (VARCHAR 3, default `'GHS'`)
- [x] Add `CARD` to `PaymentMethodType` enum

### Migration
- [x] Create migration `AddMultiCountrySupport` (all ALTERs above)

### New Files
- [x] Create `src/utils/currency.ts` — currency symbol map + `formatCurrency()` helper
- [x] Create `src/services/payment/payment-provider-registry.ts` — country → provider mapping

### Service Refactors
- [x] `PaymentService` — remove hardcoded `"GHS"`, resolve currency from user country via `platform_settings`
- [x] `PaymentService` — remove `new PaystackProvider()` constructor, resolve from provider registry
- [x] `PaymentService` — add `processOrderPayment()` method (country-aware from day one)
- [x] `PaymentService.creditDriverEarnings()` — read commission from `platform_settings` not hardcoded 80/20
- [x] `WalletService.createWallet()` — accept country, resolve currency from `platform_settings`
- [x] `FareService.calculateFare()` — filter `vehicle_pricing` by country
- [x] `FareService.getVehiclePricing()` — filter by country, use renamed `basePrice` field
- [x] `FareService.getSurgeMultiplier()` — filter `surge_rules` by country
- [x] `NotificationService` — replace all `GHS ${amount}` with `formatCurrency(amount, currency)`
- [x] `PaystackProvider.detectMomoProvider()` — make country-aware

## Phase 2B — Products & Merchant

- [x] `ProductService` — CRUD + customizations + stock management
- [x] `ProductController` + routes (16 routes, full Swagger JSDoc)
- [x] Product image upload (multipart → MinIO via UploadService)
- [x] `MerchantService` — dashboard, operating hours, stats, finances, order management
- [x] `MerchantController` + routes (~15 routes, full Swagger JSDoc)
- [x] `SearchService` — unified product/merchant search + Haversine geo filtering + Redis cache
- [x] `SearchController` + routes
- [x] All routes registered in `index.ts` (`/api/v1/products`, `/api/v1/merchant`, `/api/v1/search`)

## Phase 2C — Cart & Checkout

- [ ] `CartService` — add/remove/update, single-merchant enforcement, Redis cache layer
- [ ] `CartController` + routes
- [ ] `DeliveryFeeService` — distance-based fee calc from `platform_settings`
- [ ] `PickupCodeService` — generate & verify 6-char codes
- [ ] `OrderService` — quote, checkout, status transitions, order number generation
- [ ] `OrderController` + routes (customer-facing)
- [ ] Extend `PaymentService` for order payments

## Phase 2D — Settlement & Delivery

- [ ] `SettlementService` — cash delivery, cash pickup, online delivery, online pickup
- [ ] Driver delivery acceptance + status updates (extend driver routes)
- [ ] Pickup code verification → settlement trigger
- [ ] Order completion → wallet credits/debits
- [ ] `OrderRating` flow
- [ ] Order notifications (merchant, customer, driver)

## Phase 2E — Admin Back-Office

- [ ] Admin order management (list, view, override status, refund, cancel)
- [ ] Admin merchant management (approve, suspend, update rates, view details)
- [ ] Admin payout management (list, approve, reject)
- [ ] Admin platform settings CRUD
- [ ] Admin dashboard aggregations
- [ ] Revenue & order reports

## Phase 2F — Polish

- [ ] Swagger docs for all new endpoints
- [ ] Rate limiting on cart/checkout (Redis)
- [ ] Stock/out-of-stock edge cases
- [ ] Register all new routes in `index.ts`
- [ ] Production deployment
