import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Velo Backend API",
      version: "1.0.1",
      description: `
## Ride-hailing, delivery & wallet API for the VeloHub platform.

### 🔑 How to authenticate

1. Click the **Authorize** button (🔓) at the top right.
2. Enter your \`X-API-Key\` value and click **Authorize**.
3. Every request will now include the API key header automatically.

### 📱 Phone number auth
Most endpoints require a \`phoneNumber\` field — either in the **request body** (POST/PUT/DELETE) or as a **query parameter** (GET).
This is used for role-based access (buyer, driver, merchant). Use a real registered phone in E.164 format: \`+233501234567\`

### 🎯 Quick start
1. **Auth** → \`POST /auth/request-otp\` with your phone number
2. **Auth** → \`POST /auth/verify-otp\` with the OTP code you received
3. You're in! Now use any endpoint with your phone number.
      `,
      contact: { name: "VeloCourier" },
    },
    servers: [
      {
        url: "/api/v1",
        description: "API v1 (main)",
      },
      {
        url: "/api",
        description: "Legacy (orders)",
      },
    ],
    tags: [
      { name: "Health", description: "Server health & connectivity checks — **no auth required**" },
      { name: "Auth", description: "OTP-based phone authentication — request & verify OTPs" },
      { name: "Profile", description: "Setup buyer / driver / merchant profiles" },
      { name: "Rides", description: "Request rides, get estimates, manage active rides (buyer)" },
      { name: "Driver", description: "Driver operations — go online, accept rides, update location" },
      { name: "Payments", description: "Paystack payments, webhook, verification" },
      { name: "Wallet", description: "Wallet balance & transaction history" },
      { name: "Locations", description: "Saved locations (Home, Work, etc.)" },
      { name: "Ratings", description: "Rate completed rides & marketplace orders" },
      { name: "Places", description: "Google Places — autocomplete, details, distance, reverse geocode" },
      { name: "Notifications", description: "In-app notifications & push token management" },
      { name: "Uploads", description: "File uploads to MinIO — images & PDFs for ID verification" },
      { name: "Waitlist", description: "Join waitlist & manage countries" },
      { name: "Products", description: "Marketplace products — browse, create, manage stock & customizations" },
      { name: "Merchant", description: "Merchant profile, store settings, hours, orders & analytics" },
      { name: "Search", description: "Unified search — merchants & products with geo filtering" },
      { name: "Cart", description: "Shopping cart — add items, update quantities, clear" },
      { name: "Orders", description: "Marketplace orders — quote, checkout, track, cancel" },
      { name: "Driver - Deliveries", description: "Driver marketplace delivery operations — accept, pickup, deliver" },
      { name: "Admin", description: "Admin — users, drivers, merchants, rides (legacy)" },
      { name: "Admin - Dashboard", description: "Admin dashboard overview & analytics" },
      { name: "Admin - Orders", description: "Admin order management & status overrides" },
      { name: "Admin - Products", description: "Admin product moderation — suspend, reactivate, delete" },
      { name: "Admin - Merchants", description: "Admin merchant verification, rates & management" },
      { name: "Admin - Payouts", description: "Admin payout approval & rejection" },
      { name: "Admin - Settings", description: "Platform settings per country — rates, fees, limits" },
      { name: "Admin - Reports", description: "Revenue & order distribution reports" },
      { name: "Admin - Support", description: "Driver assignment, wallet credits/debits" },
      { name: "Dev", description: "Development/debug endpoints — **not for production**" },
      { name: "Services", description: "Service bookings — request, track, and manage service hires" },
      { name: "Subscriptions", description: "Service access subscriptions — manage paywall and access status" },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description:
            "Your API key. Click **Authorize** above, paste it in, and every request will include it automatically.",
        },
      },
      parameters: {
        PhoneNumber: {
          name: "phoneNumber",
          in: "query",
          required: true,
          description: "Your registered phone number in E.164 format (used for auth/role lookup on GET requests)",
          schema: { type: "string", example: "+233501234567" },
        },
        Limit: {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", default: 20 },
          description: "Max items to return (pagination)",
        },
        Offset: {
          name: "offset",
          in: "query",
          required: false,
          schema: { type: "integer", default: 0 },
          description: "Items to skip (pagination)",
        },
      },
      schemas: {
        // ─── Common ─────────────────────────────────────
        Error: {
          type: "object",
          properties: {
            message: { type: "string", example: "Something went wrong" },
          },
        },
        SuccessMessage: {
          type: "object",
          properties: {
            message: { type: "string", example: "Operation successful" },
          },
        },

        // ─── Uploads ────────────────────────────────────
        UploadResult: {
          type: "object",
          properties: {
            url: {
              type: "string",
              format: "uri",
              example: "http://minio-service:9000/velo-uploads/id-cards/abc123/550e8400.jpg",
            },
            key: { type: "string", example: "id-cards/abc123/550e8400-e29b-41d4.jpg" },
            bucket: { type: "string", example: "velo-uploads" },
            size: { type: "integer", example: 245760, description: "File size in bytes" },
            mimeType: { type: "string", example: "image/jpeg" },
            checksum: { type: "string", example: "e3b0c44298fc1c149afbf4c8996fb924..." },
          },
        },

        // ─── Auth ───────────────────────────────────────
        RequestOtpBody: {
          type: "object",
          required: ["phoneNumber"],
          properties: {
            phoneNumber: {
              type: "string",
              example: "+233501234567",
              description: "Phone number in E.164 format",
            },
          },
        },
        VerifyOtpBody: {
          type: "object",
          required: ["phoneNumber", "code"],
          properties: {
            phoneNumber: {
              type: "string",
              example: "+233501234567",
              description: "Same phone number used in request-otp",
            },
            code: {
              type: "string",
              example: "123456",
              description: "6-digit OTP received via SMS",
            },
          },
        },

        // ─── Profile ───────────────────────────────────
        BuyerSetupBody: {
          type: "object",
          required: ["phone", "full_name", "email", "location", "country_code", "privacy_consent"],
          properties: {
            phone: { type: "string", example: "+233501234567" },
            full_name: { type: "string", example: "Kwame Asante" },
            email: { type: "string", example: "kwame@example.com" },
            location: { type: "string", example: "Greater Accra", description: "State, Region, or Province" },
            country_code: { type: "string", example: "GH", description: "ISO 2-letter country code" },
            ghana_card_number: { type: "string", example: "GHA-123456789-0", description: "Required if country_code is GH" },
            role: { type: "string", example: "customer" },
            privacy_consent: { type: "boolean", example: true },
          },
        },
        DriverSetupBody: {
          type: "object",
          required: ["phone", "full_name", "email", "location", "country_code", "vehicle_type", "vehicle_number", "license_number", "privacy_consent"],
          properties: {
            phone: { type: "string", example: "+233501234567" },
            full_name: { type: "string", example: "Isaac Menuve" },
            email: { type: "string", example: "isaac@example.com" },
            location: { type: "string", example: "Greater Accra" },
            country_code: { type: "string", example: "GH" },
            vehicle_type: { type: "string", example: "Motorcycle" },
            vehicle_number: { type: "string", example: "GR 1234-22" },
            vehicle_model: { type: "string", example: "Yamaha" },
            vehicle_color: { type: "string", example: "Blue" },
            license_number: { type: "string", example: "D-1234567" },
            ghana_card_number: { type: "string", example: "GHA-123456789-0" },
            ghana_card_front_url: { type: "string", format: "uri" },
            ghana_card_back_url: { type: "string", format: "uri" },
            role: { type: "string", example: "driver" },
            privacy_consent: { type: "boolean", example: true },
          },
        },
        MerchantSetupBody: {
          type: "object",
          required: ["phone", "business_name", "business_type", "business_address", "business_email", "location", "country_code", "privacy_consent"],
          properties: {
            phone: { type: "string", example: "+233541234567" },
            business_name: { type: "string", example: "Tasty Treats" },
            business_type: { type: "string", example: "Restaurant" },
            business_address: { type: "string", example: "123 Main St, Accra" },
            business_email: { type: "string", format: "email", example: "contact@tastytreats.com" },
            location: { type: "string", example: "Greater Accra" },
            country_code: { type: "string", example: "GH" },
            ghana_card_number: { type: "string", example: "GHA-123456789-0" },
            ghana_card_front_url: { type: "string", format: "uri" },
            ghana_card_back_url: { type: "string", format: "uri" },
            role: { type: "string", example: "merchant" },
            privacy_consent: { type: "boolean", example: true },
          },
        },

        // ─── Rides ──────────────────────────────────────
        FareEstimateBody: {
          type: "object",
          required: ["phoneNumber", "distanceKm", "durationMin", "pickupLat", "pickupLng"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            distanceKm: { type: "number", example: 5.2, description: "Trip distance in km" },
            durationMin: { type: "number", example: 15, description: "Estimated trip duration in minutes" },
            pickupLat: { type: "number", example: 5.6037, description: "Pickup latitude" },
            pickupLng: { type: "number", example: -0.187, description: "Pickup longitude" },
            promoCode: { type: "string", example: "FIRST10", description: "Optional promo code for discount" },
          },
        },
        RequestRideBody: {
          type: "object",
          required: [
            "phoneNumber", "pickupAddress", "pickupLat", "pickupLng",
            "dropoffAddress", "dropoffLat", "dropoffLng",
            "vehicleType", "distanceKm", "durationMin",
          ],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            type: { type: "string", enum: ["ride", "delivery"], default: "ride", description: "Ride type" },
            pickupAddress: { type: "string", example: "Accra Mall, Tetteh Quarshie" },
            pickupLat: { type: "number", example: 5.6037 },
            pickupLng: { type: "number", example: -0.187 },
            dropoffAddress: { type: "string", example: "University of Ghana, Legon" },
            dropoffLat: { type: "number", example: 5.6502 },
            dropoffLng: { type: "number", example: -0.1869 },
            vehicleType: { type: "string", enum: ["motorbike", "car", "van"], example: "motorbike" },
            distanceKm: { type: "number", example: 5.2 },
            durationMin: { type: "number", example: 15 },
            passengerCount: { type: "integer", example: 1, description: "Number of passengers (car/van only)" },
            promoCode: { type: "string", example: "FIRST10" },
            stops: {
              type: "array",
              description: "Optional intermediate stops",
              items: {
                type: "object",
                properties: {
                  address: { type: "string", example: "East Legon, Accra" },
                  lat: { type: "number", example: 5.6315 },
                  lng: { type: "number", example: -0.1583 },
                  order: { type: "integer", example: 1 },
                },
              },
            },
            sharedContacts: {
              type: "array",
              description: "People to notify about this ride (safety feature)",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Ama" },
                  phone: { type: "string", example: "+233241234567" },
                },
              },
            },
          },
        },
        SetPaymentBody: {
          type: "object",
          required: ["phoneNumber", "paymentMethod"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            paymentMethod: {
              type: "string",
              enum: ["cash", "wallet", "mobile_money"],
              example: "mobile_money",
              description: "How the rider will pay",
            },
            email: { type: "string", example: "kwame@example.com", description: "Required for mobile_money" },
          },
        },
        CancelRideBody: {
          type: "object",
          required: ["phoneNumber"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            reason: { type: "string", example: "Changed my mind", description: "Optional cancellation reason" },
          },
        },

        // ─── Driver ─────────────────────────────────────
        DriverLocationBody: {
          type: "object",
          required: ["phoneNumber", "lat", "lng"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            lat: { type: "number", example: 5.6037, description: "Current latitude" },
            lng: { type: "number", example: -0.187, description: "Current longitude" },
            heading: { type: "number", example: 45.0, description: "Compass heading in degrees" },
            speed: { type: "number", example: 30.5, description: "Speed in km/h" },
          },
        },
        DriverOnlineBody: {
          type: "object",
          required: ["phoneNumber", "lat", "lng"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            lat: { type: "number", example: 5.6037, description: "Current latitude" },
            lng: { type: "number", example: -0.187, description: "Current longitude" },
          },
        },
        PhoneOnlyBody: {
          type: "object",
          required: ["phoneNumber"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
          },
        },
        AcceptRideBody: {
          type: "object",
          required: ["phoneNumber", "driverName"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            driverName: { type: "string", example: "Kofi Mensah" },
          },
        },
        DriverStatusBody: {
          type: "object",
          required: ["phoneNumber"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            driverName: { type: "string", example: "Kofi Mensah" },
          },
        },

        // ─── Locations ──────────────────────────────────
        SaveLocationBody: {
          type: "object",
          required: ["phoneNumber", "label", "address", "lat", "lng"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            label: { type: "string", example: "Home", description: "Label like Home, Work, Gym" },
            address: { type: "string", example: "123 Main St, East Legon, Accra" },
            lat: { type: "number", example: 5.6315 },
            lng: { type: "number", example: -0.1583 },
          },
        },
        UpdateLocationBody: {
          type: "object",
          required: ["phoneNumber"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            label: { type: "string", example: "Work" },
            address: { type: "string", example: "456 Ring Rd, Osu, Accra" },
            lat: { type: "number", example: 5.5571 },
            lng: { type: "number", example: -0.1818 },
          },
        },

        // ─── Ratings ────────────────────────────────────
        RateRideBody: {
          type: "object",
          required: ["phoneNumber", "rideId", "rating"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            rideId: { type: "string", format: "uuid", example: "550e8400-e29b-41d4-a716-446655440000" },
            rating: { type: "integer", minimum: 1, maximum: 5, example: 5, description: "1-5 stars" },
            comment: { type: "string", example: "Great ride, very safe!", description: "Optional review text" },
          },
        },

        // ─── Places ─────────────────────────────────────
        DistanceBody: {
          type: "object",
          required: ["phoneNumber", "originLat", "originLng", "destLat", "destLng"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            originLat: { type: "number", example: 5.6037, description: "Origin latitude" },
            originLng: { type: "number", example: -0.187, description: "Origin longitude" },
            destLat: { type: "number", example: 5.6502, description: "Destination latitude" },
            destLng: { type: "number", example: -0.1869, description: "Destination longitude" },
          },
        },
        ReverseGeocodeBody: {
          type: "object",
          required: ["phoneNumber", "lat", "lng"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            lat: { type: "number", example: 5.6037 },
            lng: { type: "number", example: -0.187 },
          },
        },

        // ─── Notifications ──────────────────────────────
        PushTokenBody: {
          type: "object",
          required: ["phoneNumber", "token", "platform"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            token: {
              type: "string",
              example: "ExponentPushToken[xxxxxx]",
              description: "Expo or FCM push token",
            },
            platform: {
              type: "string",
              enum: ["ios", "android"],
              example: "android",
              description: "Device platform",
            },
          },
        },
        RemovePushTokenBody: {
          type: "object",
          required: ["phoneNumber", "token"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            token: { type: "string", example: "ExponentPushToken[xxxxxx]" },
          },
        },

        // ─── Health ─────────────────────────────────────
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", example: "healthy", enum: ["healthy", "degraded"] },
            version: { type: "string", example: "1.0.0" },
            uptime: { type: "number", example: 3600, description: "Server uptime in seconds" },
            timestamp: { type: "string", format: "date-time" },
            services: {
              type: "object",
              properties: {
                database: { type: "string", enum: ["connected", "disconnected"] },
                redis: { type: "string", enum: ["connected", "disconnected"] },
              },
            },
          },
        },

        // ─── Services ───────────────────────────────────
        CreateBookingBody: {
          type: "object",
          required: ["merchantId", "productId", "serviceTitle", "price", "preferredDate", "serviceAddress", "paymentMethod"],
          properties: {
            merchantId: { type: "string", format: "uuid", example: "550e8400-e29b-41d4-a716-446655440000" },
            productId: { type: "string", format: "uuid", example: "550e8400-e29b-41d4-a716-446655440001" },
            serviceTitle: { type: "string", example: "AC Repair & Maintenance" },
            price: { type: "number", example: 150.0 },
            preferredDate: { type: "string", format: "date", example: "2024-12-25" },
            preferredTimeSlot: { type: "string", example: "09:00 - 12:00" },
            serviceAddress: { type: "string", example: "15 Independence Ave, Accra" },
            customerNotes: { type: "string", example: "Entrance is at the back" },
            paymentMethod: { type: "string", enum: ["momo", "card", "wallet"], example: "momo" },
            phoneNumber: { type: "string", example: "+233501234567" },
          },
        },
        UpdateBookingStatusBody: {
          type: "object",
          required: ["status"],
          properties: {
            status: { 
              type: "string", 
              enum: ["requested", "accepted", "declined", "scheduled", "in_progress", "completed", "cancelled"],
              example: "accepted" 
            },
            note: { type: "string", example: "Technician is on the way" },
          },
        },
        BookingResponse: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            bookingNumber: { type: "string", example: "SRV-20241026-ABC123" },
            status: { type: "string" },
            price: { type: "number" },
            currency: { type: "string" },
            serviceTitle: { type: "string" },
            serviceAddress: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        // ─── Subscriptions ─────────────────────────────
        InitiateSubscriptionBody: {
          type: "object",
          required: ["paymentMethod"],
          properties: {
            paymentMethod: { type: "string", enum: ["momo", "card", "wallet"], example: "momo" },
            phoneNumber: { type: "string", example: "+233501234567" },
          },
        },
        SubscriptionStatusResponse: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["none", "pending", "active", "cancelled", "expired"], example: "active" },
            currentPeriodStart: { type: "string", format: "date-time" },
            currentPeriodEnd: { type: "string", format: "date-time" },
            hasAccess: { type: "boolean", example: true },
          },
        },
      },
    },
    // Global security — applies to ALL endpoints unless overridden with `security: []`
    security: [{ ApiKeyAuth: [] }],
  },
  apis: ["./src/routes/*.ts", "./src/routes/*.js", "./dist/routes/*.js"],
};

export const swaggerSpec = swaggerJsdoc(options);
