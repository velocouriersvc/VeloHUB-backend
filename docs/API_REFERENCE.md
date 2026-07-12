# VeloHub Backend - API & Services Reference

> **Base URL:** `http://<host>:3000/api/v1`
> **Currency:** GHS (Ghanaian Cedis)
> **Auth model:** All protected routes require `X-API-Key` header + `phoneNumber` in request body (the middleware looks up the user by phone and checks their approved role).

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Profile](#2-profile)
3. [Places (Google Maps)](#3-places-google-maps)
4. [Rides (Customer)](#4-rides-customer)
5. [Driver](#5-driver)
6. [Payments](#6-payments)
7. [Wallet](#7-wallet)
8. [Ratings](#8-ratings)
9. [Saved Locations](#9-saved-locations)
10. [Notifications](#10-notifications)
11. [Services Overview](#11-services-overview)
12. [Enums & Constants](#12-enums--constants)
13. [Ride Flow (Step by Step)](#13-ride-flow-step-by-step)
14. [Environment Variables](#14-environment-variables)

---

## 1. Authentication

**Prefix:** `/api/v1/auth`
**Auth:** API key only (no phone/role check)

| Method | Endpoint | Body | Response | Notes |
|--------|----------|------|----------|-------|
| POST | `/request-otp` | `{ phoneNumber }` | `{ message, otp? }` | Sends OTP via Twilio |
| POST | `/verify-otp` | `{ phoneNumber, code }` | `{ message, user }` | Verifies OTP, returns user |
| POST | `/sync` | `{ id, phoneNumber, email? }` | `{ user }` | Syncs Supabase user to backend DB |

---

## 2. Profile

**Prefix:** `/api/v1/profile`
**Auth:** API key + phone + role check

| Method | Endpoint | Role | Body | Response |
|--------|----------|------|------|----------|
| POST | `/buyer` | buyer | `{ fullName, email? }` | `{ profile }` |
| POST | `/driver` | driver | `{ fullName, licenseNumber, vehicleType, plateNumber, ... }` | `{ profile }` |
| POST | `/merchant` | merchant | `{ businessName, ... }` | `{ profile }` |

---

## 3. Places (Google Maps)

**Prefix:** `/api/v1/places`
**Auth:** API key + phone + role (buyer or driver)

### 3.1 Autocomplete - search places as user types

```
GET /api/v1/places/autocomplete?input=Accra%20Mall&sessionToken=abc123
```

**Query params:**
- `input` (required) - search text
- `sessionToken` (optional) - Google session token for billing grouping

**Response:**
```json
{
  "predictions": [
    {
      "placeId": "ChIJ...",
      "description": "Accra Mall, Tetteh Quarshie, Accra, Ghana",
      "mainText": "Accra Mall",
      "secondaryText": "Tetteh Quarshie, Accra, Ghana"
    }
  ]
}
```

### 3.2 Place Details - get coordinates from place ID

```
GET /api/v1/places/details/:placeId?sessionToken=abc123
```

**Response:**
```json
{
  "place": {
    "placeId": "ChIJ...",
    "address": "Accra Mall, Tetteh Quarshie, Accra, Ghana",
    "lat": 5.6359,
    "lng": -0.1750
  }
}
```

### 3.3 Distance - driving distance & duration between two points

```
POST /api/v1/places/distance
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "originLat": 5.6359,
  "originLng": -0.1750,
  "destLat": 5.6037,
  "destLng": -0.1870
}
```

**Response:**
```json
{
  "distance": {
    "distanceKm": 8.42,
    "durationMin": 22.5,
    "distanceText": "8.4 km",
    "durationText": "23 mins"
  }
}
```

### 3.4 Reverse Geocode - address from coordinates

```
POST /api/v1/places/reverse-geocode
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "lat": 5.6359,
  "lng": -0.1750
}
```

**Response:**
```json
{
  "address": "Accra Mall, Tetteh Quarshie Interchange, Accra, Ghana"
}
```

---

## 4. Rides (Customer)

**Prefix:** `/api/v1/rides`
**Auth:** API key + phone + role (buyer)

### 4.1 Get All Fare Estimates

```
POST /api/v1/rides/estimate
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "distanceKm": 8.42,
  "durationMin": 22.5,
  "pickupLat": 5.6359,
  "pickupLng": -0.1750,
  "promoCode": "VELO20"
}
```

**Response:**
```json
{
  "estimates": [
    {
      "fareBreakdown": {
        "baseFare": 3.00,
        "subtotal": 15.84,
        "surgeMultiplier": 1.0,
        "surgeAmount": 0,
        "discountPercent": 20,
        "discountAmount": 3.17,
        "finalFare": 12.67,
        "vehicleType": "bike",
        "distanceKm": 8.42,
        "durationMin": 22.5
      },
      "availableDrivers": 3,
      "estimatedPickupMin": 5
    },
    {
      "fareBreakdown": { "...": "car estimate" },
      "availableDrivers": 1,
      "estimatedPickupMin": 8
    }
  ]
}
```

### 4.2 Get Single Vehicle Estimate

```
POST /api/v1/rides/estimate/:vehicleType
```

Vehicle types: `bike`, `car`, `suv`, `truck`

Same body/response as above but returns a single `{ estimate }`.

### 4.3 Request a Ride

```
POST /api/v1/rides/request
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "type": "ride",
  "pickupAddress": "Accra Mall, Tetteh Quarshie",
  "pickupLat": 5.6359,
  "pickupLng": -0.1750,
  "dropoffAddress": "University of Ghana, Legon",
  "dropoffLat": 5.6505,
  "dropoffLng": -0.1862,
  "vehicleType": "car",
  "distanceKm": 8.42,
  "durationMin": 22.5,
  "passengerCount": 2,
  "promoCode": "VELO20",
  "stops": [
    {
      "address": "East Legon, Accra",
      "lat": 5.6351,
      "lng": -0.1580,
      "stopOrder": 1
    }
  ],
  "sharedContacts": [
    { "name": "Mum", "phone": "+233241234567" }
  ]
}
```

**Notes:**
- `type`: `"ride"` or `"delivery"`
- `stops` (optional): intermediate stops, each with `stopOrder`
- `sharedContacts` (optional): people to SMS when ride starts
- `promoCode` (optional): applied to fare calculation
- `distanceKm` and `durationMin`: frontend gets these from `/places/distance` first

**Response:** `201`
```json
{
  "ride": {
    "id": "uuid",
    "customerId": "uuid",
    "driverId": null,
    "type": "ride",
    "pickupAddress": "...",
    "pickupLat": 5.6359,
    "pickupLng": -0.1750,
    "dropoffAddress": "...",
    "dropoffLat": 5.6505,
    "dropoffLng": -0.1862,
    "vehicleType": "car",
    "distanceKm": 8.42,
    "durationMin": 22.5,
    "baseFare": 5.00,
    "subtotal": 19.84,
    "surgeMultiplier": 1.0,
    "surgeAmount": 0,
    "discountPercent": 20,
    "discountAmount": 3.97,
    "finalFare": 15.87,
    "paymentMethod": null,
    "paymentStatus": "pending",
    "status": "searching",
    "passengerCount": 2,
    "searchRadiusKm": 15,
    "createdAt": "2026-03-01T12:00:00Z",
    "acceptedAt": null,
    "paidAt": null,
    "startedAt": null,
    "completedAt": null,
    "cancelledAt": null
  }
}
```

### 4.4 Set Payment Method

```
POST /api/v1/rides/:id/payment
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "paymentMethod": "momo",
  "email": "user@example.com"
}
```

**Payment methods:** `"momo"`, `"wallet"`, `"cash"`

- **momo** - initiates Paystack charge, customer approves on their phone. Response may include `authorizationUrl`.
- **wallet** - instant debit from wallet. Ride moves to `paid` status immediately.
- **cash** - ride moves to `paid` status immediately. Driver collects cash after ride.

**Response:**
```json
{
  "ride": {
    "status": "paid",
    "paymentMethod": "wallet",
    "paymentStatus": "paid",
    "paidAt": "2026-03-01T12:01:00Z"
  }
}
```

### 4.5 Cancel a Ride

```
POST /api/v1/rides/:id/cancel
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "reason": "Changed my mind"
}
```

**Response:**
```json
{
  "ride": {
    "status": "cancelled",
    "cancelledBy": "customer",
    "cancelReason": "Changed my mind",
    "cancelledAt": "2026-03-01T12:02:00Z"
  }
}
```

### 4.6 Get Active Ride

```
GET /api/v1/rides/active
```

**Body:** `{ "phoneNumber": "+233..." }`

Returns the customer's current non-completed/non-cancelled ride, or `{ "ride": null }`.

### 4.7 Get Ride History

```
GET /api/v1/rides/history?limit=20&offset=0
```

**Body:** `{ "phoneNumber": "+233..." }`

**Response:**
```json
{
  "rides": [ ... ],
  "total": 42
}
```

### 4.8 Get Ride by ID

```
GET /api/v1/rides/:id
```

**Body:** `{ "phoneNumber": "+233..." }`

**Response:**
```json
{
  "ride": { "...full ride object with stops and sharedContacts..." }
}
```

---

## 5. Driver

**Prefix:** `/api/v1/driver`
**Auth:** API key + phone + role (driver)

> All driver endpoints require `phoneNumber` in body.

### 5.1 Go Online

```
POST /api/v1/driver/online
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "lat": 5.6359,
  "lng": -0.1750
}
```

**Response:**
```json
{ "message": "You are now online", "status": "online" }
```

### 5.2 Go Offline

```
POST /api/v1/driver/offline
```

**Body:** `{ "phoneNumber": "+233..." }`

**Response:**
```json
{ "message": "You are now offline", "status": "offline" }
```

### 5.3 Update Location

```
POST /api/v1/driver/location
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "lat": 5.6359,
  "lng": -0.1750,
  "heading": 180,
  "speed": 35.5
}
```

**Notes:** Call this every few seconds while driver is online. `heading` and `speed` are optional.

**Response:**
```json
{ "message": "Location updated" }
```

### 5.4 Accept Ride

```
POST /api/v1/driver/rides/:id/accept
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "driverName": "Kwame Asante"
}
```

**Response:** `{ "ride": { "status": "accepted", "driverId": "uuid", ... } }`

### 5.5 En Route to Pickup

```
POST /api/v1/driver/rides/:id/enroute
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "driverName": "Kwame Asante"
}
```

**Response:** `{ "ride": { "status": "driver_enroute" } }`

### 5.6 Arrived at Pickup

```
POST /api/v1/driver/rides/:id/arrived
```

**Body:** `{ "phoneNumber": "+233...", "driverName": "Kwame Asante" }`

**Response:** `{ "ride": { "status": "arrived" } }`

### 5.7 Start Ride

```
POST /api/v1/driver/rides/:id/start
```

**Body:** `{ "phoneNumber": "+233..." }`

**Notes:** Sends SMS to shared contacts when ride starts.

**Response:** `{ "ride": { "status": "ongoing", "startedAt": "..." } }`

### 5.8 Complete Ride

```
POST /api/v1/driver/rides/:id/complete
```

**Body:** `{ "phoneNumber": "+233..." }`

**Notes:**
- Driver earnings (80% of fare) are automatically credited to driver's wallet
- Cash payments are auto-confirmed on completion
- Customer and driver both get notifications

**Response:** `{ "ride": { "status": "completed", "completedAt": "..." } }`

### 5.9 Get Active Ride (Driver)

```
GET /api/v1/driver/rides/active
```

**Body:** `{ "phoneNumber": "+233..." }`

**Response:** `{ "ride": { ... } }` or `{ "ride": null }`

### 5.10 Get Ride History (Driver)

```
GET /api/v1/driver/rides/history?limit=20&offset=0
```

**Body:** `{ "phoneNumber": "+233..." }`

**Response:** `{ "rides": [...], "total": 15 }`

### 5.11 Get Driver Stats

```
GET /api/v1/driver/stats
```

**Body:** `{ "phoneNumber": "+233..." }`

**Response:**
```json
{
  "stats": {
    "driverId": "uuid",
    "totalRides": 124,
    "totalEarnings": 4580.50,
    "averageRating": 4.72,
    "ratingCount": 98
  }
}
```

---

## 6. Payments

**Prefix:** `/api/v1/payments`

### 6.1 Paystack Webhook

```
POST /api/v1/payments/webhook
```

**Auth:** None - verified by `x-paystack-signature` header (HMAC SHA512).

**Notes:** Paystack calls this when a momo payment is confirmed. The backend verifies the signature, finds the matching payment record, and updates the ride status to `paid`. **Frontend does not call this.**

### 6.2 Verify Payment

```
POST /api/v1/payments/verify/:reference
```

**Auth:** API key + phone (buyer or driver)

**Body:** `{ "phoneNumber": "+233..." }`

**Notes:** Manual fallback if webhook doesn't fire. Pass the payment reference.

**Response:**
```json
{
  "payment": {
    "id": "uuid",
    "rideId": "uuid",
    "amount": 15.87,
    "currency": "GHS",
    "method": "momo",
    "provider": "paystack",
    "platformFee": 3.17,
    "driverAmount": 12.70,
    "status": "success",
    "completedAt": "2026-03-01T12:01:30Z"
  }
}
```

### 6.3 Payment History

```
GET /api/v1/payments/history?limit=20&offset=0
```

**Auth:** API key + phone (buyer or driver)

**Body:** `{ "phoneNumber": "+233..." }`

**Response:**
```json
{
  "payments": [ ... ],
  "total": 30
}
```

---

## 7. Wallet

**Prefix:** `/api/v1/wallet`
**Auth:** API key + phone + role (buyer or driver)

### 7.1 Get Wallet

```
GET /api/v1/wallet
```

**Body:** `{ "phoneNumber": "+233..." }`

**Notes:** Auto-creates wallet if user doesn't have one yet.

**Response:**
```json
{
  "wallet": {
    "id": "uuid",
    "userId": "uuid",
    "balance": 125.50,
    "currency": "GHS",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### 7.2 Get Transaction History

```
GET /api/v1/wallet/transactions?limit=20&offset=0
```

**Body:** `{ "phoneNumber": "+233..." }`

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "walletId": "uuid",
      "type": "credit",
      "amount": 12.70,
      "balanceBefore": 112.80,
      "balanceAfter": 125.50,
      "reference": "CR-a1b2c3d4e5f6",
      "description": "Ride earnings",
      "metadata": { "rideId": "uuid", "totalFare": 15.87 },
      "createdAt": "..."
    }
  ],
  "total": 45
}
```

---

## 8. Ratings

**Prefix:** `/api/v1/ratings`
**Auth:** API key + phone + role

### 8.1 Rate a Ride

```
POST /api/v1/ratings
```

**Role:** buyer

**Body:**
```json
{
  "phoneNumber": "+233...",
  "rideId": "uuid",
  "rating": 5,
  "comment": "Great driver, very safe!"
}
```

**Notes:**
- `rating`: integer 1–5
- `comment` is optional
- Can only rate completed rides
- One rating per ride
- Auto-updates driver's average rating and stats

**Response:** `201`
```json
{
  "rating": {
    "id": "uuid",
    "rideId": "uuid",
    "driverId": "uuid",
    "customerId": "uuid",
    "rating": 5,
    "comment": "Great driver, very safe!",
    "createdAt": "..."
  }
}
```

### 8.2 Get Ride Rating

```
GET /api/v1/ratings/ride/:rideId
```

**Role:** buyer or driver

**Body:** `{ "phoneNumber": "+233..." }`

**Response:** `{ "rating": { ... } }` or `{ "rating": null }`

### 8.3 Get Driver Ratings

```
GET /api/v1/ratings/driver/:driverId?limit=20&offset=0
```

**Role:** buyer or driver

**Body:** `{ "phoneNumber": "+233..." }`

**Response:**
```json
{
  "ratings": [ ... ],
  "total": 98
}
```

---

## 9. Saved Locations

**Prefix:** `/api/v1/locations`
**Auth:** API key + phone + role (buyer)

### 9.1 Save a Location

```
POST /api/v1/locations
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "label": "Home",
  "address": "East Legon, Accra, Ghana",
  "lat": 5.6351,
  "lng": -0.1580
}
```

**Response:** `201`
```json
{
  "location": {
    "id": "uuid",
    "userId": "uuid",
    "label": "Home",
    "address": "East Legon, Accra, Ghana",
    "lat": 5.6351,
    "lng": -0.1580,
    "createdAt": "..."
  }
}
```

### 9.2 Get All Locations

```
GET /api/v1/locations
```

**Body:** `{ "phoneNumber": "+233..." }`

**Response:**
```json
{
  "locations": [ ... ]
}
```

### 9.3 Update a Location

```
PUT /api/v1/locations/:id
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "label": "Home (New)",
  "address": "Airport Residential, Accra"
}
```

All fields except `phoneNumber` are optional - only send what you want to update.

**Response:** `{ "location": { ... } }`

### 9.4 Delete a Location

```
DELETE /api/v1/locations/:id
```

**Body:** `{ "phoneNumber": "+233..." }`

**Response:** `{ "message": "Location deleted" }`

---

## 10. Notifications

**Prefix:** `/api/v1/notifications`
**Auth:** API key + phone + role (buyer, driver, or merchant)

### 10.1 Get Notifications

```
GET /api/v1/notifications?limit=30&offset=0
```

**Body:** `{ "phoneNumber": "+233..." }`

**Response:**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "userId": "uuid",
      "type": "ride_completed",
      "title": "Ride Completed ✅",
      "body": "Your ride is complete. Fare: GHS 15.87",
      "data": { "rideId": "uuid", "fare": 15.87 },
      "isRead": false,
      "createdAt": "2026-03-01T12:30:00Z"
    }
  ],
  "total": 25,
  "unreadCount": 3
}
```

### 10.2 Mark as Read

```
PUT /api/v1/notifications/:id/read
```

**Body:** `{ "phoneNumber": "+233..." }`

**Response:** `{ "message": "Notification marked as read" }`

### 10.3 Mark All as Read

```
PUT /api/v1/notifications/read-all
```

**Body:** `{ "phoneNumber": "+233..." }`

**Response:** `{ "message": "All notifications marked as read" }`

### 10.4 Register Push Token

```
POST /api/v1/notifications/push-token
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "token": "ExponentPushToken[...]",
  "platform": "ios"
}
```

**Notes:**
- `platform`: `"ios"` or `"android"`
- Call on app launch / login
- Old tokens for same device are auto-deactivated

**Response:** `201`
```json
{
  "pushToken": {
    "id": "uuid",
    "userId": "uuid",
    "token": "ExponentPushToken[...]",
    "platform": "ios",
    "isActive": true
  }
}
```

### 10.5 Remove Push Token (Logout)

```
DELETE /api/v1/notifications/push-token
```

**Body:**
```json
{
  "phoneNumber": "+233...",
  "token": "ExponentPushToken[...]"
}
```

**Response:** `{ "message": "Push token removed" }`

### Notification Types (for frontend filtering/icons)

| Type | When Created |
|------|-------------|
| `ride_requested` | New ride broadcast to driver |
| `ride_accepted` | Driver accepts ride → customer |
| `ride_cancelled` | Either party cancels |
| `driver_enroute` | Driver heading to pickup → customer |
| `driver_arrived` | Driver at pickup → customer |
| `ride_started` | Ride begins → customer |
| `ride_completed` | Ride ends → customer |
| `payment_received` | Payment confirmed → driver |
| `payment_failed` | Payment fails |
| `wallet_credited` | Money added to wallet (earnings) |
| `wallet_debited` | Money deducted from wallet |
| `commission_deducted` | Platform fee taken |
| `new_rating` | Customer rates driver → driver |
| `role_approved` | Admin approves role |
| `role_rejected` | Admin rejects role |
| `promo_code` | Promo code related |
| `system` | General system notification |

---

## 11. Services Overview

These are internal backend services. Frontend doesn't call them directly - they power the endpoints above.

| Service | What It Does |
|---------|-------------|
| **FareService** | Calculates fare: base price + (pricePerKm × distance) + (pricePerMin × duration). Applies surge multiplier (capped at 2.5×). Validates and applies promo codes. Enforces minimum fare per vehicle type. |
| **WalletService** | Creates wallets on first access. Credits (ride earnings, refunds) and debits (ride payments). Tracks every transaction with balanceBefore/balanceAfter. Generates unique references (`CR-xxx`, `DB-xxx`). |
| **PaymentService** | Routes payments to correct handler based on method (momo/wallet/cash). Splits every payment: 20% platform fee, 80% driver earnings. Credits driver wallet on ride completion. Handles Paystack webhooks. |
| **PaystackProvider** | Implements the `PaymentProvider` interface. Initiates momo charges via Paystack API. Auto-detects network (MTN/Vodafone/AirtelTigo) from phone prefix. Converts GHS ↔ pesewas. Verifies webhook signatures (HMAC SHA512). |
| **RedisLocationService** | Stores driver locations in Redis hashes (TTL 5 min). Tracks driver online/busy status. Finds nearby drivers using Haversine distance formula. Manages ride tracking data and broadcast sets. |
| **DriverMatchService** | Searches for available drivers by vehicle type. Escalates search radius: 15km → 30km → 45km. Filters by verified/approved driver profile. Broadcasts ride requests to matched drivers via notifications. |
| **RideService** | Full ride lifecycle: estimate → request → accept → pay → enroute → arrived → start → complete → cancel. Coordinates all other services. Stores stops and shared contacts. SMS-notifies shared contacts when ride starts. |
| **NotificationService** | Creates in-app notifications (stored in DB). Sends push notifications (FCM placeholder, ready to wire). Sends SMS/WhatsApp via Twilio. Has convenience methods for every ride event. |
| **RatingService** | Validates and saves ride ratings (1–5). Updates driver stats (average rating, total rides, rating count). One rating per ride, customer only. |
| **LocationService** | CRUD for saved locations (Home, Work, etc.). Scoped to user. |
| **PlacesService** | Proxies Google Maps APIs: Place Autocomplete (scoped to Ghana), Place Details, Distance Matrix, Reverse Geocoding. |

---

## 12. Enums & Constants

### Vehicle Types
```
bike | car | suv | truck
```

### Ride Types
```
ride | delivery
```

### Ride Status Flow
```
searching → accepted → awaiting_payment → paid → driver_enroute → arrived → ongoing → completed
                                                                                        ↘ cancelled
```

### Payment Methods
```
momo | cash | wallet
```

### Payment Status (on ride)
```
pending | paid | failed | refunded
```

### Payment Record Status (payments table)
```
pending | success | failed | refunded
```

### Wallet Transaction Types
```
credit | debit
```

### Cancelled By
```
customer | driver | system
```

### Driver Verification Status
```
pending | approved | rejected
```

### Commission Split
```
Platform: 20%
Driver:   80%
```

### Surge Pricing
```
Max multiplier: 2.5×
Day types: weekday | weekend | all
Rules are time-based (startHour → endHour)
```

### Driver Search Radius Escalation
```
Round 1: 15 km
Round 2: 30 km
Round 3: 45 km
```

### Redis Keys & TTLs
```
driver:location:{userId}  → Hash  → TTL 5 min
driver:status:{userId}    → String → TTL 5 min
ride:tracking:{rideId}    → Hash  → TTL 2 hours
ride:broadcast:{rideId}   → Set   → TTL 10 min
```

---

## 13. Ride Flow (Step by Step)

This is the full happy-path flow showing which endpoints to call and in what order.

### Customer Side

1. **Search for places**
   - `GET /places/autocomplete?input=...` → get pickup/dropoff placeIds
   - `GET /places/details/:placeId` → get lat/lng for each

2. **Get distance**
   - `POST /places/distance` → get `distanceKm` and `durationMin`

3. **Get fare estimates**
   - `POST /rides/estimate` → shows all vehicle options with prices and available drivers

4. **Request ride**
   - `POST /rides/request` → creates ride with status `searching`, broadcasts to nearby drivers

5. **Poll for acceptance**
   - `GET /rides/active` → check if `status` changed from `searching` to `accepted` and `driverId` is set

6. **Set payment**
   - `POST /rides/:id/payment` → choose momo/wallet/cash
   - If wallet/cash → ride moves to `paid` immediately
   - If momo → customer approves on phone, webhook confirms, ride moves to `paid`

7. **Track ride**
   - `GET /rides/active` → poll for status changes: `driver_enroute` → `arrived` → `ongoing` → `completed`

8. **Rate driver**
   - `POST /ratings` → after ride is completed

### Driver Side

1. **Go online**
   - `POST /driver/online` → with current lat/lng

2. **Keep location fresh**
   - `POST /driver/location` → every 5–10 seconds with lat/lng/heading/speed

3. **Receive ride request**
   - Watch notifications (via push or `GET /notifications`) for `ride_requested` type
   - `data.rideId` tells which ride to accept

4. **Accept ride**
   - `POST /driver/rides/:id/accept` → ride moves to `accepted`

5. **Drive to pickup**
   - `POST /driver/rides/:id/enroute` → notifies customer
   - `POST /driver/rides/:id/arrived` → notifies customer

6. **Start ride**
   - `POST /driver/rides/:id/start` → notifies customer + SMS to shared contacts

7. **Complete ride**
   - `POST /driver/rides/:id/complete` → earnings credited to wallet, customer notified

8. **Check earnings**
   - `GET /driver/stats` → total rides, earnings, rating
   - `GET /wallet` → current balance
   - `GET /wallet/transactions` → transaction history

---

## 14. Environment Variables

| Variable | Used By | Required |
|----------|---------|----------|
| `DB_HOST` | PostgreSQL | Yes |
| `DB_PORT` | PostgreSQL | Yes (default 5432) |
| `DB_USERNAME` | PostgreSQL | Yes |
| `DB_PASSWORD` | PostgreSQL | Yes |
| `DB_NAME` | PostgreSQL | Yes (default "velo") |
| `REDIS_URL` | Redis | Yes (default redis://localhost:6379) |
| `API_KEY` | API key middleware | Yes |
| `PAYSTACK_SECRET_KEY` | Paystack provider | Yes (for momo payments) |
| `GOOGLE_MAPS_API_KEY` | Places service | Yes (for autocomplete/distance) |
| `TWILIO_ACCOUNT_SID` | Twilio service | Yes (for OTP/SMS) |
| `TWILIO_AUTH_TOKEN` | Twilio service | Yes |
| `TWILIO_PHONE_NUMBER` | Twilio service | Yes |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio service | Yes (for OTP verification) |
| `PORT` | Express server | No (default 3000) |
