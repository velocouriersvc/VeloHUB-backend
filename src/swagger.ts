import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Velo Backend API",
      version: "1.0.0",
      description:
        "Ride-hailing, delivery & wallet API for the VeloHub platform. All protected endpoints require an `X-API-Key` header and a `phoneNumber` field in the request body for role-based authentication.",
      contact: {
        name: "VeloCourier",
      },
    },
    servers: [
      {
        url: "/api/v1",
        description: "API v1",
      },
      {
        url: "/api",
        description: "Legacy (orders)",
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "API key sent in the `X-API-Key` header",
        },
      },
      parameters: {
        PhoneNumber: {
          name: "phoneNumber",
          in: "query",
          description: "User's phone number (sent in body for auth/role lookup)",
          schema: { type: "string", example: "+233501234567" },
        },
        Limit: {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20 },
          description: "Number of items to return",
        },
        Offset: {
          name: "offset",
          in: "query",
          schema: { type: "integer", default: 0 },
          description: "Number of items to skip",
        },
      },
      schemas: {
        // ---------- Common ----------
        Error: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        },

        // ---------- Auth ----------
        RequestOtpBody: {
          type: "object",
          required: ["phoneNumber"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
          },
        },
        VerifyOtpBody: {
          type: "object",
          required: ["phoneNumber", "code"],
          properties: {
            phoneNumber: { type: "string", example: "+233501234567" },
            code: { type: "string", example: "123456" },
          },
        },

        // ---------- Profile ----------
        BuyerSetupBody: {
          type: "object",
          required: ["phoneNumber", "fullName"],
          properties: {
            phoneNumber: { type: "string" },
            fullName: { type: "string" },
            email: { type: "string" },
          },
        },
        DriverSetupBody: {
          type: "object",
          required: ["phoneNumber", "fullName", "vehicleType", "licensePlate"],
          properties: {
            phoneNumber: { type: "string" },
            fullName: { type: "string" },
            vehicleType: { type: "string" },
            licensePlate: { type: "string" },
            email: { type: "string" },
          },
        },
        MerchantSetupBody: {
          type: "object",
          required: ["phoneNumber", "businessName", "businessAddress"],
          properties: {
            phoneNumber: { type: "string" },
            businessName: { type: "string" },
            businessAddress: { type: "string" },
            email: { type: "string" },
          },
        },

        // ---------- Rides ----------
        FareEstimateBody: {
          type: "object",
          required: ["phoneNumber", "distanceKm", "durationMin", "pickupLat", "pickupLng"],
          properties: {
            phoneNumber: { type: "string" },
            distanceKm: { type: "number", example: 5.2 },
            durationMin: { type: "number", example: 15 },
            pickupLat: { type: "number", example: 5.6037 },
            pickupLng: { type: "number", example: -0.187 },
            promoCode: { type: "string" },
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
            phoneNumber: { type: "string" },
            type: { type: "string", enum: ["ride", "delivery"], default: "ride" },
            pickupAddress: { type: "string" },
            pickupLat: { type: "number" },
            pickupLng: { type: "number" },
            dropoffAddress: { type: "string" },
            dropoffLat: { type: "number" },
            dropoffLng: { type: "number" },
            vehicleType: { type: "string", enum: ["motorbike", "car", "van"] },
            distanceKm: { type: "number" },
            durationMin: { type: "number" },
            passengerCount: { type: "integer" },
            promoCode: { type: "string" },
            stops: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  address: { type: "string" },
                  lat: { type: "number" },
                  lng: { type: "number" },
                  order: { type: "integer" },
                },
              },
            },
            sharedContacts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  phone: { type: "string" },
                },
              },
            },
          },
        },
        SetPaymentBody: {
          type: "object",
          required: ["phoneNumber", "paymentMethod"],
          properties: {
            phoneNumber: { type: "string" },
            paymentMethod: { type: "string", enum: ["cash", "wallet", "mobile_money"] },
            email: { type: "string" },
          },
        },
        CancelRideBody: {
          type: "object",
          required: ["phoneNumber"],
          properties: {
            phoneNumber: { type: "string" },
            reason: { type: "string" },
          },
        },

        // ---------- Driver ----------
        DriverLocationBody: {
          type: "object",
          required: ["phoneNumber", "lat", "lng"],
          properties: {
            phoneNumber: { type: "string" },
            lat: { type: "number", example: 5.6037 },
            lng: { type: "number", example: -0.187 },
            heading: { type: "number" },
            speed: { type: "number" },
          },
        },
        DriverOnlineBody: {
          type: "object",
          required: ["phoneNumber", "lat", "lng"],
          properties: {
            phoneNumber: { type: "string" },
            lat: { type: "number" },
            lng: { type: "number" },
          },
        },
        AcceptRideBody: {
          type: "object",
          required: ["phoneNumber", "driverName"],
          properties: {
            phoneNumber: { type: "string" },
            driverName: { type: "string" },
          },
        },

        // ---------- Locations ----------
        SaveLocationBody: {
          type: "object",
          required: ["phoneNumber", "label", "address", "lat", "lng"],
          properties: {
            phoneNumber: { type: "string" },
            label: { type: "string", example: "Home" },
            address: { type: "string", example: "123 Main St, Accra" },
            lat: { type: "number" },
            lng: { type: "number" },
          },
        },

        // ---------- Ratings ----------
        RateRideBody: {
          type: "object",
          required: ["phoneNumber", "rideId", "rating"],
          properties: {
            phoneNumber: { type: "string" },
            rideId: { type: "string", format: "uuid" },
            rating: { type: "integer", minimum: 1, maximum: 5 },
            comment: { type: "string" },
          },
        },

        // ---------- Places ----------
        DistanceBody: {
          type: "object",
          required: ["phoneNumber", "originLat", "originLng", "destLat", "destLng"],
          properties: {
            phoneNumber: { type: "string" },
            originLat: { type: "number" },
            originLng: { type: "number" },
            destLat: { type: "number" },
            destLng: { type: "number" },
          },
        },
        ReverseGeocodeBody: {
          type: "object",
          required: ["phoneNumber", "lat", "lng"],
          properties: {
            phoneNumber: { type: "string" },
            lat: { type: "number" },
            lng: { type: "number" },
          },
        },

        // ---------- Notifications ----------
        PushTokenBody: {
          type: "object",
          required: ["phoneNumber", "token", "platform"],
          properties: {
            phoneNumber: { type: "string" },
            token: { type: "string" },
            platform: { type: "string", enum: ["ios", "android"] },
          },
        },
        RemovePushTokenBody: {
          type: "object",
          required: ["phoneNumber", "token"],
          properties: {
            phoneNumber: { type: "string" },
            token: { type: "string" },
          },
        },

        // ---------- Health ----------
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", example: "healthy" },
            version: { type: "string", example: "1.0.0" },
            uptime: { type: "number" },
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
      },
    },
    security: [{ ApiKeyAuth: [] }],
  },
  apis: ["./src/routes/*.ts", "./src/routes/*.js"],
};

export const swaggerSpec = swaggerJsdoc(options);
