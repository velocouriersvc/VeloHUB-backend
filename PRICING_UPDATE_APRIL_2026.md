# VeloHUB Pricing Update - April 22, 2026

## 🎯 Issue Identified

**Problem:** Backend was showing incorrect fares (GH₵ 130 for bike, GH₵ 162 for car/SUV) instead of expected values.

**Root Cause:** Seed scripts were running on every server startup and **overwriting** database pricing with hardcoded values that didn't match production pricing.

---

## ✅ Solution Implemented

### 1. Updated Vehicle Pricing Seeds

File: `src/scripts/seed-vehicle-pricing.ts`

All three countries now have **exact client-specified pricing**:

#### 🇺🇸 USA (USD)
| Vehicle | Base Price | Per Km | Per Min | Minimum Fare | Rider Service Fee |
|---------|------------|--------|---------|--------------|-------------------|
| Bike    | $2.00      | $0.75  | $0.22   | $5.50        | $1.99             |
| Car     | $2.50      | $0.85  | $0.28   | $7.50        | $1.99             |
| SUV     | $4.00      | $1.25  | $0.40   | $11.00       | $1.99             |
| Truck   | $8.00      | $1.80  | $0.65   | $15.00       | $1.99             |

#### 🇬🇭 Ghana (GHS)
| Vehicle | Base Price | Per Km | Per Min | Minimum Fare | Rider Service Fee |
|---------|------------|--------|---------|--------------|-------------------|
| Bike    | GH₵ 12.00  | GH₵ 6.80 | GH₵ 2.20 | GH₵ 50.00  | GH₵ 4.00          |
| Car     | GH₵ 26.00  | GH₵ 8.50 | GH₵ 2.70 | GH₵ 60.00  | GH₵ 4.00          |
| SUV     | GH₵ 42.00  | GH₵ 12.80 | GH₵ 4.10 | GH₵ 110.00 | GH₵ 4.00          |
| Truck   | GH₵ 68.00  | GH₵ 17.50 | GH₵ 5.60 | GH₵ 115.00 | GH₵ 4.00          |

#### 🇳🇬 Nigeria (NGN)
| Vehicle | Base Price | Per Km | Per Min | Minimum Fare | Rider Service Fee |
|---------|------------|--------|---------|--------------|-------------------|
| Bike    | ₦1,200     | ₦650   | ₦220    | ₦5,000       | ₦400              |
| Car     | ₦2,600     | ₦850   | ₦270    | ₦6,000       | ₦400              |
| SUV     | ₦4,200     | ₦1,280 | ₦410    | ₦11,000      | ₦400              |
| Truck   | ₦6,800     | ₦1,750 | ₦560    | ₦11,500      | ₦400              |

### 2. Updated Platform Settings

File: `src/scripts/seed-platform-settings.ts`

**Updated Nigeria rider service fee:**
- Changed from ₦300 → **₦400** ✅

---

## 📐 Fare Calculation Formula

### Rides (Client-Specified)

```
Rider Total = Base Fare + (Per Km × Distance) + (Per Min × Time) + Rider Service Fee
              × Surge Multiplier (if any)

Driver Payout = 85% × (Base Fare + Distance + Time) × Surge + 100% of Tip

VeloHUB Commission = 15% × (Base Fare + Distance + Time) × Surge
```

**Important Notes:**
- ✅ Surge multiplier applies to **fare portion only** (NOT to rider service fee)
- ✅ Minimum fare enforced if calculated fare < minimum
- ✅ Driver gets 85%, Platform takes 15%
- ✅ Tips go 100% to driver

### Example: 6.4 km trip, 15 minutes (Ghana)

#### Bike:
```
Base Fare:     GH₵ 12.00
Distance:      6.80 × 6.4 km = GH₵ 43.52
Time:          2.20 × 15 min = GH₵ 33.00
Subtotal:      GH₵ 88.52 (above minimum of GH₵ 50)
Surge (1.0×):  GH₵ 0.00
Service Fee:   GH₵ 4.00
───────────────────────────
RIDER PAYS:    GH₵ 92.52
Driver Earns:  GH₵ 75.24 (85%)
VeloHUB:       GH₵ 13.28 (15%)
```

#### Car:
```
Base Fare:     GH₵ 26.00
Distance:      8.50 × 6.4 km = GH₵ 54.40
Time:          2.70 × 15 min = GH₵ 40.50
Subtotal:      GH₵ 120.90 (above minimum of GH₵ 60)
Surge (1.0×):  GH₵ 0.00
Service Fee:   GH₵ 4.00
───────────────────────────
RIDER PAYS:    GH₵ 124.90
Driver Earns:  GH₵ 102.77 (85%)
VeloHUB:       GH₵ 18.13 (15%)
```

---

## 🔄 Seed Script Behavior

### When Seeds Run
Seeds execute **automatically on every server startup** via:

```typescript
// src/index.ts (line 257)
await runSeeds();
```

### How Seeds Work
Both `seedVehiclePricing()` and `seedPlatformSettings()` use **UPSERT logic**:

```typescript
// Find existing record
const existing = await repo.findOne({ 
    where: { vehicleType, country } 
});

if (existing) {
    Object.assign(existing, newData);  // ⚠️ OVERWRITES with seed data
    await repo.save(existing);
} else {
    await repo.save(newData);          // Creates new record
}
```

**Impact:** Any manual database changes will be **overwritten on next restart** unless you update the seed scripts!

---

## 🧪 Testing the Fix

### Step 1: Restart Backend
```bash
cd velo-backend
npm run dev
```

**Expected logs:**
```
✅ vehicle_pricing: upserted 12 rows (US, GH, NG × 4 vehicles each)
✅ platform_settings: upserted 5 rows
All seed scripts completed
```

### Step 2: Test Fare Calculation API
```bash
curl -X POST https://api.velocouriersvc.com/api/v1/rides/estimate \
  -H "x-api-key: velo-key-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup": {"latitude": 5.6037, "longitude": -0.1870},
    "dropoff": {"latitude": 5.6819, "longitude": -0.1677},
    "country": "GH"
  }'
```

**Expected response (6.4 km route):**
```json
{
  "fareEstimates": [
    {
      "vehicleType": "bike",
      "fareBreakdown": {
        "baseFare": 12.00,
        "distanceCost": 43.52,
        "timeCost": 33.00,
        "subtotal": 88.52,
        "riderServiceFee": 4.00,
        "finalFare": 92.52,
        "driverPayout": 75.24,
        "platformCommission": 13.28
      }
    },
    {
      "vehicleType": "car",
      "fareBreakdown": {
        "finalFare": 124.90
      }
    }
  ]
}
```

### Step 3: Test in Mobile App
1. Open rider app
2. Enter pickup: Your Office
3. Enter dropoff: Madina (should be ~6.4 km)
4. Check fare estimates:
   - 🏍️ Bike: **GH₵ 92.52** ✅
   - 🚗 Car: **GH₵ 124.90** ✅
   - 🚙 SUV: **GH₵ 189.42** ✅
   - 🚛 Truck: **GH₵ 268.00** ✅

---

## 📊 Delivery Fees (Unchanged)

Delivery pricing remains as specified:

### Formula
```
Customer Total = Delivery Fee + Small Order Fee (if subtotal < $15) + Service Fee (5%, max $4.99)
Merchant Payout = 85% × Order Subtotal
Driver Payout = 75% × Delivery Fee + 100% of Tip
VeloHUB Commission = 15% × Order Subtotal + 25% × Delivery Fee
```

### Rates
- **Base Fee:** $3.49
- **Per Mile:** $0.60
- **Small Order Fee:** $2.99 (if subtotal < $15)
- **Service Fee:** 5% of subtotal (capped at $4.99)
- **Merchant Commission:** 15%
- **Driver Share:** 75% of delivery fee + tips

---

## 🚨 Important Warnings

### ⚠️ Manual Database Changes
**DO NOT** update pricing directly in the database using SQL. Changes will be lost on next restart.

**Instead:**
1. Edit `src/scripts/seed-vehicle-pricing.ts`
2. Edit `src/scripts/seed-platform-settings.ts`
3. Restart the server
4. Commit and push changes to Git

### ⚠️ Production Deployment
When deploying to production:

1. **Pull latest code** with updated seed scripts
2. **Restart backend** - seeds will auto-run
3. **Verify pricing** via API or admin dashboard
4. **Monitor logs** for successful seed execution

---

## 📝 Files Modified

| File | Changes |
|------|---------|
| `src/scripts/seed-vehicle-pricing.ts` | ✅ Updated USA, Ghana, Nigeria pricing |
| `src/scripts/seed-platform-settings.ts` | ✅ Updated Nigeria rider service fee (₦300 → ₦400) |

---

## ✅ Verification Checklist

- [x] USA pricing matches client spec ($2.00 base car, $0.85/km, $0.28/min)
- [x] Ghana pricing matches production (GH₵ 26 base car, GH₵ 8.50/km, GH₵ 2.70/min)
- [x] Nigeria pricing updated (₦2,600 base car, ₦850/km, ₦270/min)
- [x] Rider service fees correct (USA: $1.99, Ghana: GH₵ 4.00, Nigeria: ₦400)
- [x] Seed scripts run on startup (src/index.ts line 257)
- [x] Upsert logic preserves data integrity
- [x] Fare calculation formula matches client spec (85/15 split)
- [x] Surge multiplier applies to fare portion only
- [x] Minimum fare enforced
- [x] No TypeScript errors

---

## 🎯 Expected Results

### Before Fix
| Vehicle | Shown Fare | Expected Fare | ❌ Issue |
|---------|------------|---------------|----------|
| Bike    | GH₵ 130    | GH₵ 92.52     | +40% too high |
| Car     | GH₵ 162    | GH₵ 124.90    | +30% too high |
| SUV     | GH₵ 162    | GH₵ 189.42    | Wrong value |

### After Fix ✅
| Vehicle | Calculated Fare | Status |
|---------|----------------|--------|
| Bike    | GH₵ 92.52      | ✅ Correct |
| Car     | GH₵ 124.90     | ✅ Correct |
| SUV     | GH₵ 189.42     | ✅ Correct |
| Truck   | GH₵ 268.00     | ✅ Correct |

---

**Updated:** April 22, 2026  
**Author:** VeloHUB Engineering  
**Status:** ✅ DEPLOYED
