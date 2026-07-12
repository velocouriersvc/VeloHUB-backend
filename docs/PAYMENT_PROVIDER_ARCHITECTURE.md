# 💳 Payment Provider Architecture

> **Last updated:** 11 March 2026

---

## TL;DR

Yes - you can add a brand-new payment provider (Stripe, Flutterwave, Razorpay, etc.) by creating **one file** that implements the `PaymentProvider` interface, then registering it in the registry with a country code. Everything else - `PaymentService`, `WalletService`, webhooks - resolves automatically.

---

## How It Works (The 4 Pieces)

```
┌──────────────────────────────────────────────────────────────────┐
│                        PaymentService                            │
│                                                                  │
│  processRidePayment({ country: "NG", ... })                     │
│  processOrderPayment({ country: "US", ... })                    │
│         │                                                        │
│         ▼                                                        │
│  resolveCountryContext("NG")                                     │
│         │                                                        │
│         ├──► PaymentProviderRegistry.getProvider("NG")           │
│         │         → returns PaystackProvider                     │
│         │                                                        │
│         └──► PlatformSettings (DB lookup)                        │
│                 → currency: "NGN"                                │
│                 → commissionRate: 15%                            │
│                                                                  │
│  Now calls provider.initiateMomoPayment({ currency: "NGN" })   │
└──────────────────────────────────────────────────────────────────┘
```

### 1. `PaymentProvider` interface (`payment-provider.interface.ts`)

This is the **contract** every payment provider must follow. If your class implements these 3 methods, it can plug into the system:

```typescript
interface PaymentProvider {
    name: string;                          // e.g. "stripe", "flutterwave"

    initiateMomoPayment(request)           // Start a payment (momo, card, etc.)
        → { success, reference, providerRef, authorizationUrl? }

    verifyPayment(reference)               // Check if a payment went through
        → { success, reference, amount, currency, ... }

    verifyWebhookSignature(payload, sig)   // Validate incoming webhook is legit
        → boolean
}
```

### 2. Provider implementations (e.g. `paystack-provider.ts`)

Each provider is a class that implements the interface above. Currently we have one:

| File | Provider | Countries |
|---|---|---|
| `paystack-provider.ts` | Paystack | GH, NG |

It handles:
- Converting amounts to smallest unit (pesewas/kobo → multiply by 100)
- Calling the Paystack `/charge` API
- Verifying transactions via `/transaction/verify`
- Checking webhook signatures (HMAC SHA-512)
- Detecting momo provider from phone prefix (MTN, Vodafone, AirtelTigo for GH; MTN, Airtel for NG)

### 3. `PaymentProviderRegistry` (`payment-provider-registry.ts`)

This is the **router** - a simple `Map<country, provider>`:

```typescript
// Current mappings (in the constructor):
"GH" → PaystackProvider
"NG" → PaystackProvider

// Unmapped countries fall back to the default (Paystack)
```

It's a **singleton** - one instance shared across the entire app:

```typescript
import { paymentProviderRegistry } from "./payment-provider-registry";

// Get the right provider for a country
const provider = paymentProviderRegistry.getProvider("NG"); // → PaystackProvider
const provider = paymentProviderRegistry.getProvider("US"); // → PaystackProvider (fallback)
```

### 4. `PaymentService` (`payment-service.ts`)

The service **never instantiates a provider directly**. Instead it calls:

```typescript
private async resolveCountryContext(country: string) {
    const provider = paymentProviderRegistry.getProvider(country);  // ← registry
    const settings = await this.settingsRepo.findOne({ where: { country } }); // ← DB

    return {
        provider,                                          // which API to call
        currency: settings.currency,                       // "GHS", "NGN", "USD"
        commissionRate: settings.defaultCommissionRate / 100  // 0.15, 0.20, etc.
    };
}
```

Every payment method (`processRidePayment`, `processOrderPayment`, `creditDriverEarnings`) passes `country` through this resolver. The correct provider, currency, and commission are used automatically.

---

## Adding a New Provider (Step by Step)

### Example: Adding Stripe for the US

**Step 1 - Create the provider file**

```
src/services/payment/stripe-provider.ts
```

```typescript
import { PaymentProvider, MomoPaymentRequest, PaymentVerification } from "./payment-provider.interface";

export class StripeProvider implements PaymentProvider {
    name = "stripe";
    private secretKey: string;

    constructor() {
        this.secretKey = process.env.STRIPE_SECRET_KEY || "";
    }

    async initiateMomoPayment(request: MomoPaymentRequest) {
        // Use Stripe's Payment Intents API
        // Convert amount to cents: request.amount * 100
        // POST to https://api.stripe.com/v1/payment_intents
        // Return { success, reference, providerRef, authorizationUrl }
    }

    async verifyPayment(reference: string): Promise<PaymentVerification> {
        // GET https://api.stripe.com/v1/payment_intents/{reference}
        // Return { success, reference, amount, currency, ... }
    }

    verifyWebhookSignature(payload: string, signature: string): boolean {
        // Use Stripe's webhook signature verification
        // stripe.webhooks.constructEvent(payload, signature, endpointSecret)
    }
}
```

**Step 2 - Register it in the registry**

Open `payment-provider-registry.ts` and add one line in the constructor:

```typescript
constructor() {
    const paystack = new PaystackProvider();
    const stripe = new StripeProvider();       // ← new

    this.defaultProvider = paystack;

    this.providers.set("GH", paystack);
    this.providers.set("NG", paystack);
    this.providers.set("US", stripe);          // ← new
    this.providers.set("CA", stripe);          // ← new
}
```

**Step 3 - Make sure the country has `platform_settings`**

The US and CA rows already exist in `platform_settings` (from the seed script):

| country | currency | commissionRate |
|---|---|---|
| US | USD | 20% |
| CA | CAD | 20% |

**Step 4 - Add the env var**

```env
STRIPE_SECRET_KEY=sk_live_...
```

**That's it.** When a US user pays, the flow is:

```
processOrderPayment({ country: "US" })
  → resolveCountryContext("US")
    → provider: StripeProvider
    → currency: "USD"
    → commissionRate: 0.20
  → stripe.initiateMomoPayment({ amount: 25, currency: "USD", ... })
```

---

## What Gets Resolved Per Country

| Data Point | Source | Example (GH) | Example (US) |
|---|---|---|---|
| Payment provider | `PaymentProviderRegistry` | Paystack | Stripe |
| Currency code | `platform_settings` table | GHS | USD |
| Platform commission | `platform_settings` table | 15% | 20% |
| Delivery fees | `platform_settings` table | GHS 5.00 base | USD 3.00 base |
| Vehicle pricing | `vehicle_pricing` table (filtered by country) | GHS rates | USD rates |
| Surge rules | `surge_rules` table (filtered by country) | GH rules | US rules |
| Currency formatting | `currency.ts` util | GH₵ 45.50 | $45.50 |

---

## Current File Structure

```
src/services/payment/
├── payment-provider.interface.ts     ← The contract (3 methods)
├── paystack-provider.ts              ← Paystack implementation (GH + NG)
├── payment-provider-registry.ts      ← Country → Provider mapping (singleton)
└── payment-service.ts                ← Main service (calls registry, never calls Paystack directly)
```

When you add Stripe:

```
src/services/payment/
├── payment-provider.interface.ts
├── paystack-provider.ts              ← GH, NG
├── stripe-provider.ts                ← US, CA (NEW)
├── payment-provider-registry.ts      ← Updated with Stripe mapping
└── payment-service.ts                ← No changes needed
```

---

## Webhook Handling

Currently `PaymentService.handleWebhook()` accepts an optional `country` param to resolve the right provider for signature verification:

```typescript
async handleWebhook(payload: string, signature: string, country?: string) {
    const provider = paymentProviderRegistry.getProvider(country || "GH");
    const isValid = provider.verifyWebhookSignature(payload, signature);
    // ...
}
```

When you add Stripe, you'll likely want **separate webhook endpoints** per provider since Paystack and Stripe send completely different payload formats:

```
POST /api/v1/webhooks/paystack   →  handleWebhook(payload, sig, "GH")
POST /api/v1/webhooks/stripe     →  handleStripeWebhook(payload, sig)
```

This is a future task for Phase 2C/2D when order payments go live.

---

## Key Design Decisions

| Decision | Why |
|---|---|
| **Registry is a singleton** | One instance, no duplicate provider objects, import anywhere |
| **Default fallback is Paystack** | Unmapped countries still work - won't crash |
| **`country` param defaults to `"GH"`** | All existing code (ride-service, wallet-controller) works without changes |
| **Commission comes from DB, not constants** | Each country can have different rates, changeable at runtime via admin |
| **Interface method is called `initiateMomoPayment`** | Naming is legacy from Ghana-first - it handles card payments too (Paystack's charge endpoint accepts both) |

---

## FAQ

**Q: Does the provider know about the country?**
No. The provider only knows about `amount`, `currency`, `phoneNumber`, and `reference`. The country-awareness lives in the registry + `platform_settings`. The provider is a dumb API wrapper.

**Q: Can one country use multiple providers?**
Not currently - it's a 1:1 mapping (one provider per country). If needed later, extend the registry to support an array of providers per country with a priority/fallback chain.

**Q: What if I need card payments but not momo?**
The interface method is called `initiateMomoPayment` but it works for cards too. For Stripe you'd use Payment Intents which handle cards natively. The name is a bit misleading - think of it as `initiatePayment`. We can rename it in a future refactor.

**Q: Where do I add the API keys?**
Each provider reads its own env var in its constructor. Paystack reads `PAYSTACK_SECRET_KEY`. Your new provider reads whatever you define (e.g. `STRIPE_SECRET_KEY`). Add them to your `.env` and K8s secrets.
