# Currency Conversion Service

## Overview

The VeloCourier backend now uses **real-time exchange rates** for currency conversion when processing Stripe payments. This ensures accurate conversions that reflect current market rates.

## Architecture

### Components

1. **CurrencyConversionService** (`src/services/currency-conversion-service.ts`)
   - Fetches live exchange rates from API
   - Caches rates for 1 hour to reduce API calls
   - Falls back to hardcoded rates if API is unavailable
   - Provides currency conversion with full metadata

2. **StripeProvider** (`src/services/payment/stripe-provider.ts`)
   - Uses CurrencyConversionService for unsupported currencies
   - Automatically converts GHS, NGN, XOF, XAF to USD
   - Stores conversion metadata in Stripe PaymentIntent

## How It Works

### Exchange Rate API

We use **[open.er-api.com](https://open.er-api.com/)** - a free, no-auth exchange rate API:
- ✅ **Free forever** (no API key needed)
- ✅ **1,500+ requests/day**
- ✅ **170+ currencies supported**
- ✅ **Updated hourly**
- ✅ **No sign-up required**

### Caching Strategy

```typescript
// Rates are cached for 1 hour
CACHE_DURATION_MS = 3600000 (1 hour)

// First request → Fetches from API
// Subsequent requests → Uses cache
// After 1 hour → Fetches fresh rates
```

This minimizes API calls while keeping rates reasonably current.

### Conversion Flow

```
User Payment (5,851.48 GHS)
    ↓
Currency Service checks if GHS is supported by Stripe
    ↓ (Not supported)
Fetch live exchange rates from API
    ↓
Cache rates for 1 hour
    ↓
Convert: 5,851.48 GHS → 368.64 USD (using live rate)
    ↓
Create Stripe PaymentIntent with USD amount
    ↓
Store conversion metadata:
    {
      originalAmount: 5851.48,
      originalCurrency: "GHS",
      convertedAmount: 368.64,
      convertedCurrency: "USD",
      conversionRate: 0.063,
      conversionTimestamp: 1713729580000
    }
```

## API Details

### Endpoint
```
GET https://open.er-api.com/v6/latest/USD
```

### Response Format
```json
{
  "result": "success",
  "time_last_update_unix": 1713729600,
  "time_last_update_utc": "Sun, 21 Apr 2024 00:00:00 +0000",
  "time_next_update_unix": 1713816000,
  "time_next_update_utc": "Mon, 22 Apr 2024 00:00:00 +0000",
  "base_code": "USD",
  "rates": {
    "USD": 1,
    "GHS": 15.87,
    "NGN": 1500.25,
    "EUR": 0.92,
    "GBP": 0.79,
    "CAD": 1.41,
    "INR": 83.12,
    "KES": 130.50,
    "ZAR": 18.23
  }
}
```

### Rate Interpretation
```typescript
// API returns: 1 USD = X units of foreign currency
// Example: rates.GHS = 15.87 means 1 USD = 15.87 GHS

// To convert GHS to USD:
amountInUSD = amountInGHS / rates.GHS
// Example: 5851.48 / 15.87 = 368.64 USD
```

## Fallback Mechanism

If the API is unavailable, the service uses hardcoded rates:

```typescript
FALLBACK_RATES = {
    USD: 1.0,
    GHS: 0.063,    // ≈ 15.87 GHS per USD
    NGN: 0.00067,  // ≈ 1,500 NGN per USD
    CAD: 0.71,
    INR: 0.012,    // ≈ 83 INR per USD
    EUR: 1.08,
    GBP: 1.26,
    KES: 0.0077,   // ≈ 130 KES per USD
    ZAR: 0.055,    // ≈ 18 ZAR per USD
}
```

## Usage Examples

### Basic Conversion
```typescript
import { currencyConversionService } from './services/currency-conversion-service';

// Convert 5,851.48 GHS to USD
const result = await currencyConversionService.convertCurrency(5851.48, 'GHS', 'USD');

console.log(result);
// {
//   amount: 368.64,
//   currency: 'USD',
//   originalAmount: 5851.48,
//   originalCurrency: 'GHS',
//   rate: 0.063,
//   timestamp: 1713729580000
// }
```

### Check Stripe Support
```typescript
// Check if currency is supported by Stripe
const isSupported = currencyConversionService.isStripeSupportedCurrency('GHS');
console.log(isSupported); // false

const isUSDSupported = currencyConversionService.isStripeSupportedCurrency('USD');
console.log(isUSDSupported); // true
```

## Payment Metadata

Every converted payment includes detailed metadata:

```json
{
  "source": "package_delivery",
  "recipientName": "John Doe",
  "recipientPhone": "+233243708228",
  "originalAmount": 5851.48,
  "originalCurrency": "GHS",
  "convertedAmount": 368.64,
  "convertedCurrency": "USD",
  "conversionRate": 0.063,
  "conversionTimestamp": 1713729580000
}
```

This allows you to:
- ✅ Track original transaction amounts in local currency
- ✅ Generate accurate invoices/receipts
- ✅ Reconcile payments in both currencies
- ✅ Audit exchange rates used at time of payment

## Monitoring

### Logs

The service provides detailed logging:

```
[CurrencyConversionService] Exchange rates fetched successfully
  baseCurrency: USD, ratesCount: 170

[CurrencyConversionService] Using cached exchange rates
  age: 450s

[CurrencyConversionService] Currency converted
  from: 5851.48 GHS, to: 368.64 USD, rate: 0.063

[StripeProvider] Currency converted for Stripe using live rates
  from: 5851.48 GHS, to: 368.64 USD, rate: 0.063

[StripeProvider] PaymentIntent created
  id: pi_xxx, amount: 36864, currency: USD
```

### Error Handling

If the API fails, the service gracefully falls back:

```
[CurrencyConversionService] Failed to fetch exchange rates from API, using fallback
  error: timeout of 5000ms exceeded

[CurrencyConversionService] Currency converted
  from: 5851.48 GHS, to: 368.64 USD, rate: 0.063 (FALLBACK)
```

## Performance

### API Call Frequency
- **Without caching**: ~5,000 requests/day (1 per payment)
- **With 1-hour cache**: ~24 requests/day (1 per hour)
- **API limit**: 1,500+ requests/day ✅

### Response Times
- **Cache hit**: <1ms
- **API call**: ~200-500ms
- **Timeout**: 5 seconds

## Supported Currencies

### Stripe-Supported (No Conversion)
- USD, EUR, GBP, CAD, AUD, INR, JPY, etc.

### Auto-Converted to USD
- **GHS** (Ghanaian Cedi)
- **NGN** (Nigerian Naira)
- **XOF** (West African CFA Franc)
- **XAF** (Central African CFA Franc)

## Testing

### Test Currency Conversion
```bash
# From backend directory
npx ts-node -e "
import { currencyConversionService } from './src/services/currency-conversion-service';

(async () => {
  const result = await currencyConversionService.convertCurrency(5851.48, 'GHS', 'USD');
  console.log('Conversion Result:', result);
})();
"
```

### Test Payment Flow
1. Create package delivery with GHS fare
2. Select card payment
3. Check backend logs for conversion
4. Verify Stripe shows USD amount
5. Check payment metadata in Stripe dashboard

## Future Enhancements

### Option 1: Premium API (More Accurate)
```typescript
// Use exchangerate-api.com with API key
// Free tier: 1,500 requests/month
// Pro tier: $9/month for 100,000 requests

API_URL = 'https://v6.exchangerate-api.com/v6/YOUR_API_KEY/latest/USD'
```

### Option 2: Database Storage
```typescript
// Store exchange rates in database
// Update daily via cron job
// Reduce API dependency

CREATE TABLE exchange_rates (
  currency VARCHAR(3),
  rate DECIMAL(10, 6),
  base_currency VARCHAR(3) DEFAULT 'USD',
  updated_at TIMESTAMP
);
```

### Option 3: Multiple Sources
```typescript
// Fetch from multiple APIs
// Use average rate for accuracy
// Fallback if one API fails

const sources = [
  'open.er-api.com',
  'exchangerate-api.com',
  'currencyapi.com'
];
```

## Troubleshooting

### Issue: Conversion Errors
```
Error: Exchange rate not found for GHS or USD
```
**Solution**: API may be down. Service automatically uses fallback rates.

### Issue: Old Exchange Rates
```
Conversion seems outdated
```
**Solution**: Cache may be stale. Rates refresh every hour. Check logs:
```
[CurrencyConversionService] Using cached exchange rates
  age: 3500s
```

### Issue: API Timeout
```
Failed to fetch exchange rates from API, using fallback
```
**Solution**: Network issue or API down. Service uses fallback rates automatically.

## Security

- ✅ No API keys stored (free API)
- ✅ HTTPS only
- ✅ 5-second timeout prevents hanging
- ✅ Fallback rates prevent payment failures
- ✅ Conversion metadata logged for audit

## Compliance

- ✅ Transparent currency conversion
- ✅ Full metadata in payment records
- ✅ Rate at time of transaction stored
- ✅ Original amount preserved

---

**Last Updated**: 21 April 2026  
**API Provider**: [open.er-api.com](https://open.er-api.com/)  
**Cache Duration**: 1 hour  
**Fallback**: Hardcoded approximate rates
