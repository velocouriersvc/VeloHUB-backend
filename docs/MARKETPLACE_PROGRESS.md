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

- [x] `CartService` — add/remove/update, single-merchant enforcement, Redis cache layer
- [x] `CartController` + routes (5 routes, full Swagger JSDoc)
- [x] `DeliveryFeeService` — distance-based fee calc from `platform_settings`
- [x] `PickupCodeService` — generate & verify 6-char codes
- [x] `OrderService` — quote, checkout, status transitions, order number generation
- [x] `MarketplaceOrderController` + routes (5 routes, full Swagger JSDoc)
- [x] Extend `PaymentService` for order payments (already done in Phase 2A+ — `processOrderPayment()`)
- [x] All routes registered in `index.ts` (`/api/v1/cart`, `/api/v1/marketplace/orders`)

## Phase 2D — Settlement & Delivery

- [x] `SettlementService` — all 4 settlement flows (cash delivery, cash pickup, online delivery, online pickup)
  - Wallet credits/debits with full metadata (orderId, orderNumber, settlementType, breakdown)
  - Commission, service fee, pickup fee, delivery fee calculations
  - Merchant overrides (commissionRate, serviceFeeRate, pickupFeeRate) → platform defaults → fallbacks
  - Order marked COMPLETED + SETTLED, status history recorded
  - Prometheus metrics: `settlementEventsTotal`, `orderEventsTotal`
- [x] Driver delivery acceptance + status updates
  - `DeliveryService` — getAvailableDeliveries (Haversine proximity filter), acceptDelivery (Redis lock prevents double-accept), updateDeliveryStatus (DRIVER_ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED), completeDelivery → settlement trigger
  - `DeliveryController` — 6 endpoints (available, active, history, accept, status, complete)
  - Added to `driverRoutes.ts` — 6 new routes with full Swagger JSDoc (`[Driver - Deliveries]` tag)
- [x] Pickup code verification → settlement trigger
  - `MerchantService.completePickupOrder()` — verifies code via existing `verifyPickupCode()`, triggers `SettlementService.settleOrder()`
  - `MerchantController.completePickupOrder` endpoint — returns settlement breakdown
  - `merchantRoutes.ts` — `POST /merchant/orders/:orderId/complete-pickup` with Swagger JSDoc
- [x] Order completion → wallet credits/debits
  - All handled by SettlementService — driver.wallet debit (cash), merchant.wallet credit (earnings), driver.wallet credit (delivery fee for online), platform retains commission + serviceFee
  - WalletTransaction metadata carries full audit trail
- [x] `OrderRating` flow
  - `OrderRatingService` — rateOrder (validates ownership, completion, duplicate), getOrderRating, getMerchantRatings (paginated)
  - `OrderRatingController` — 3 endpoints (rate, get order rating, get merchant reviews)
  - Added to `ratingRoutes.ts` — `POST /ratings/order`, `GET /ratings/order/:orderId`, `GET /ratings/merchant/:merchantId` with Swagger JSDoc
  - Updates `MerchantStats` via `merchantService.updateRating()`
- [x] Order notifications (merchant, customer, driver)
  - Settlement notifications: ORDER_COMPLETED to customer, merchant, driver
  - Delivery lifecycle: ORDER_PICKED_UP, ORDER_IN_TRANSIT, ORDER_DELIVERED to customer + merchant
  - Driver assigned: notified to customer + merchant
  - Rating: NEW_PRODUCT_REVIEW to merchant, NEW_RATING to driver
- [x] Merchant payout request flow
  - `MerchantService.requestPayout()` — validates balance, debits wallet, PAYOUT_REQUESTED notification
  - `MerchantController.requestPayout` endpoint
  - `merchantRoutes.ts` — `POST /merchant/request-payout` with Swagger JSDoc

## Phase 2E — Admin Back-Office

- [x] Admin dashboard aggregations
  - `AdminService.getDashboard()` — user/merchant/driver counts, today's orders/rides/revenue/platformFees, pending actions (merchant approvals, driver approvals, payouts, stuck orders)
  - `AdminController.getDashboard` → `GET /admin/dashboard`
- [x] Admin order management (list, view, override status, refund, cancel)
  - `AdminService.getOrders()` — paginated, 8 filters (status, merchantId, customerId, paymentStatus, deliveryType, from, to)
  - `AdminService.getOrderDetail()` — full order with customer/merchant/driver/items/statusHistory, merchant businessName
  - `AdminService.overrideOrderStatus()` — status change + timestamp updates + history record
  - `AdminService.refundOrder()` — credits customer wallet via WalletService, marks REFUNDED, notifies
  - `AdminService.adminCancelOrder()` — CANCELLED by ADMIN, notifies customer + merchant
  - `AdminController` — 5 order endpoints: getOrders, getOrderDetail, overrideOrderStatus, refundOrder, adminCancelOrder
  - Routes: `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/status`, `POST /orders/:id/refund`, `POST /orders/:id/cancel`
- [x] Admin product management (list, suspend, reactivate, delete)
  - `AdminService.getProducts()` — paginated, withDeleted, 4 filters (merchantId, category, isActive, search)
  - `AdminService.suspendProduct()`, `reactivateProduct()`, `deleteProduct()` — soft-delete support
  - `AdminController` — 3 product endpoints: getProducts, updateProduct (suspend/reactivate), deleteProduct
  - Routes: `GET /products`, `PATCH /products/:id`, `DELETE /products/:id`
- [x] Admin merchant management (approve, suspend, update rates, view details, orders, finances)
  - `AdminService.getMerchantDetails()` — profile + stats + wallet + productCount + recentOrders
  - `AdminService.updateMerchantRates()` — validates 0-100, updates commission/service/pickup rates
  - `AdminService.suspendMerchant()` — REJECTED + isOpen=false + user SUSPENDED + notification
  - `AdminService.approveMerchant()` — APPROVED + approves UserRole + un-suspends user + creates wallet + notification
  - `AdminService.getMerchantOrders()` — paginated with status filter
  - `AdminService.getMerchantFinances()` — wallet + rates + revenue stats + recentTransactions + pendingPayouts
  - `AdminController` — 6 merchant endpoints
  - Routes: `GET /merchants/:id/details`, `PATCH /merchants/:id/rates`, `POST /merchants/:id/suspend`, `POST /merchants/:id/approve`, `GET /merchants/:id/orders`, `GET /merchants/:id/finances`
- [x] Admin payout management (list, approve, reject)
  - `AdminService.getPayouts()` — queries WalletTransactions metadata.type=payout, joins wallet+user, status filter
  - `AdminService.approvePayout()` — updates metadata.status=completed, PAYOUT_COMPLETED notification
  - `AdminService.rejectPayout()` — refunds via WalletService.credit, metadata.status=rejected, notification
  - `AdminController` — 3 payout endpoints
  - Routes: `GET /payouts`, `PATCH /payouts/:id/approve`, `PATCH /payouts/:id/reject`
- [x] Admin platform settings CRUD
  - `AdminService.getSettings()` — all PlatformSettings by country
  - `AdminService.updateSettings()` — upsert for a country
  - `AdminController` — 2 settings endpoints
  - Routes: `GET /settings`, `PUT /settings/:country`
- [x] Revenue & order reports
  - `AdminService.getRevenueReport(from, to)` — aggregates totalRevenue, commission, serviceFees, deliveryFees, discounts, merchantEarnings, platformRevenue
  - `AdminService.getOrderReport(from, to)` — counts by status, paymentMethod, deliveryType
  - `AdminController` — 2 report endpoints
  - Routes: `GET /reports/revenue`, `GET /reports/orders`
- [x] Support actions (assign/reassign driver, credit/debit wallet)
  - `AdminService.assignDriverToOrder()` / `reassignDriverToOrder()` — with notifications
  - `AdminService.creditUserWallet()` / `debitUserWallet()` — with notifications
  - `AdminController` — 4 support endpoints
  - Routes: `POST /orders/:id/assign-driver`, `POST /orders/:id/reassign-driver`, `POST /users/:id/credit-wallet`, `POST /users/:id/debit-wallet`
- [x] Full Swagger JSDoc on all 27 admin routes (6 legacy + 21 new)
- [x] All endpoints verified — 0 compile errors across service, controller, routes

## Phase 2F — Polish ✅

- [x] **Swagger docs verified** — All route files (cart, order, merchant, product, delivery, search, admin, rating) have complete `@openapi` JSDoc
- [x] **All routes registered in index.ts** — Verified: products, merchant, search, cart, marketplace/orders, admin — 0 missing
- [x] **Strict TypeScript types** — Created 13 type files in `src/types/`:
  - `pagination.ts` — PaginationParams, PaginatedResult<T>, paginate(), parsePagination()
  - `order.ts` — OrderQuoteBody, CheckoutBody, CancelOrderBody, CustomerOrdersQuery + response types
  - `product.ts` — CreateProductBody, UpdateProductBody, CreateCustomizationBody, CreateOptionBody, BulkStockUpdateBody + responses
  - `merchant.ts` — UpdateMerchantProfileBody, ToggleOpenBody, SetOperatingHoursBody, AcceptOrderBody, RejectOrderBody, UpdateOrderStatusBody, VerifyPickupBody, RequestPayoutBody + responses
  - `cart.ts` — AddToCartBody, UpdateCartItemBody, CartResponse, CartConflictResponse
  - `delivery.ts` — AvailableDeliveriesQuery, UpdateDeliveryStatusBody + response types
  - `settlement.ts` — SettlementResultDTO, SettlementBreakdownResponse
  - `rating.ts` — CreateOrderRatingBody, OrderRatingResponse, MerchantReviewResponse
  - `search.ts` — SearchQuery, SearchResultResponse, MerchantSearchItem, ProductSearchItem
  - `admin.ts` — AdminOrdersQuery, AdminOverrideStatusBody, AdminAssignDriverBody, AdminWalletAdjustmentBody + response types
  - `wallet.ts` — FundWalletBody, WalletBalanceResponse
  - `platform.ts` — PlatformSettingsResponse, DeliveryFeeBreakdownResponse
  - `index.ts` — barrel export of all type modules
- [x] **Anti-pattern audit — zero `any` types remaining** in services & controllers:
  - merchant-service.ts: `where: any` → `FindOptionsWhere<Order>`, `settlement: any` → `SettlementResult`, `recentTransactions: any[]` → `WalletTransactionResponse[]`
  - order-service.ts: `where: any` → `FindOptionsWhere<Order>`, `catch (payError: any)` → `catch (payError)`
  - delivery-service.ts: `settlement: any` → `SettlementResult`
  - auth-service.ts: `(ur: any)` → `(ur: UserRole)`, `catch (error: any)` → `catch (error)`
  - profile-service.ts: `data: any` → `Record<string, unknown>`, `queryRunner: any` → `QueryRunner`
  - places-service.ts: `(p: any)` → `(p: GooglePrediction)` with typed interface
  - paystack-provider.ts: `catch (error: any)` → `catch (error)` with `AxiosError` typing
  - twilio-service.ts: `Promise<any>` → typed return types, 5× `catch` fixes
  - Bulk fix: 33+ `catch (error: any)` → `catch (error)` with `(error as Error).message` across 15 files (services + controllers)
- [x] **Request validation middleware** — `src/middleware/validate.ts`:
  - Chainable builder API: `body()`, `query()`, `param()` with `.required()`, `.isString()`, `.isNumber()`, `.isUUID()`, `.isIn()`, `.isArray()`, `.isBoolean()`, `.min()`, `.max()`, `.minLength()`, `.isPositive()`, `.isInt()`, `.custom()`
  - Returns 400 with `{ success: false, errors: [...] }` on validation failure
  - Wired into 7 route files:
    - marketplaceOrderRoutes: quote (deliveryType), checkout (deliveryType + paymentMethod)
    - cartRoutes: addItem (productId UUID + quantity), updateItem (quantity min 1)
    - merchantRoutes: toggleOpen, setHours, acceptOrder, rejectOrder (reason), updateStatus, verifyPickup
    - productRoutes: createProduct (name + category + price), updateStock (items array)
    - driverRoutes: updateDeliveryStatus (status enum)
    - ratingRoutes: rateOrder (orderId UUID + merchantRating 1-5)
    - adminRoutes: overrideStatus, assignDriver, reassignDriver, rejectPayout, creditWallet, debitWallet
- [x] **Type cleanup** — `profile.ts` `last_location: any` → `{ lat: number; lng: number }`, `auth.ts` `[key: string]: any` → `unknown`
- [x] All files verified — 0 compile errors across entire codebase
