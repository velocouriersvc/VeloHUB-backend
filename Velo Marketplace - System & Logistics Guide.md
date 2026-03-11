

# **Velo Marketplace \- System & Logistics Guide**

This document provides a detailed technical and operational overview of how the Velo Marketplace ecosystem functions, covering product management, ordering logistics, payment systems, and financial settlements.  
---

## **1\. Product & Service Management (Merchant Side)**

The platform supports a diverse range of items including physical products, food, pharmacy items, and professional services.

### Adding Products & Services

Merchants add items via the Seller Dashboard. The platform dynamically adjusts the form based on the selected Category:

* General Products: Standard inventory management (name, price, stock, tags, images).  
* Rentals: Includes additional fields for rental\_duration (hourly, daily, etc.), deposit, and item\_type.  
* Pharmacy: Requires expiration\_date, dosage\_info, and a toggle for prescription\_required.  
* Food: Allows for complex Customization Options (e.g., choice of proteins, extras, drinks, and sides).  
* Services: Items like plumbing or photography are treated as "services," where stock\_quantity is automatically set to a high number (effectively infinite), and a service\_duration field is provided.

### Categories & Intelligence

The system uses category mapping to determine UI behavior (icons, gradients) and business logic (e.g., specific fees for food pickup).

* Primary Categories: Rentals, Pharmacy, Marketplace, Grocery, Food, Services (Photography, Plumbing, Electrical, Cleaning).

---

## **2\. Ordering Flow (User Experience)**

### Customer Side

1. Selection: Users browse products or services and add them to their Cart.  
2. Customization: For food items, users select their desired extras or proteins.  
3. Delivery Selection: Users choose between:  
   * Standard Delivery: Items delivered by a driver to the customer's address.  
   * Pickup (Food & Groceries): Customer collects the order directly from the merchant.  
4. Checkout:  
   * Coupon Codes: Discounts are validated against minimum order values and category restrictions.  
   * Quote Generation: The system calls a quoteOrder edge function to calculate the final price, including delivery fees and service charges.  
5. Payment choice: Users select from Momo, Card, or Cash.

### Merchant Side

1. Order Notification: Merchants receive real-time notifications of new orders.  
2. Order Management: Merchants can accept or decline orders.  
3. Status Tracking: Merchants update the status (e.g., "Preparing," "Ready for Pickup").

---

## **3\. Logistics & Fulfillment**

The platform uses a variety of fulfillment models depending on the delivery\_type and order\_category.

### Delivery (Standard)

* Driver Assignment: For delivery orders, a driver is assigned to pick up the item from the merchant and deliver it to the customer.  
* Tracking: Customers can track the driver's location in real-time.

### Pickup (The Pickup Code System)

* To ensure security, a 6-digit alphanumeric pickup code is generated for the customer.  
* Merchant Verification: When the customer arrives, the merchant enters this code in their app to verify the collection.  
* Settlement: Verifying the code triggers the release of funds (online) or the deduction of fees (cash).

---

## **4\. Financial Model & Payment Methods**

Velo supports three primary payment methods, each with a distinct settlement logic:

### Supported Methods

* Mobile Money (Momo) & Card: Processed via Paystack. Funds are held in escrow by the platform until the order is successfully completed.  
* Cash: The "Collector" (merchant or driver) receives the money directly from the customer.

### The "Deduction from Earnings" System (Cash Settlement)

When an order is paid in Cash, no money flows through the platform. To collect its fees, the system deducts from the collector's digital wallet.

| Flow Type | Who Collects Cash? | Deduction Logic (Platform Fee) |
| :---- | :---- | :---- |
| Delivery | Driver | Deduct Merchant Amount \+ Platform Fee from driver's wallet. Credit Merchant Amount to merchant's wallet. |
| Rides (Taxi) | Driver | Deduct Platform Share from driver's wallet. |
| Pickup | Merchant | Deduct Platform Fee (e.g., 10%) from merchant's wallet. |

---

## **5\. Fee Structure & Merchant Earnings**

The platform calculates merchant earnings based on a split logic:

### Fee Breakdown

* Service Fee: Typically 8% to 10% (configured by category, e.g., 10% for food pickup).  
* Commission: Usually 15%.  
* Total Platform Charge: Often totals 23% of the subtotal.

### Earnings Calculation

Merchant Net Earnings \= Subtotal \- Service Fee \- Commission \- Discount Share (if applicable).

### Payouts

Merchants can view their accumulated "Main Balance" in the Finances tab and request a payout to their bank or Momo account once they reach a minimum threshold.  
---

## **6\. User Experience Summary Table**

| Perspective | Key Actions |
| :---- | :---- |
| Customer | Search → Customize → Pay (Online/Cash) → Receive Code → Rate |
| Merchant | Add Product/Service → Accept Order → Prepare → Verify Pickup Code → Request Payout |
| Driver | Accept Delivery Request → Pick Up → Navigate → Deliver → Collect Cash (if applicable) |
| System | Quote Price → Process Payment → Split Funds → Manage Escrow → Settle Cash Deductions |

Perfect 👌🏾 Peacefill — based on your **Velo Marketplace System & Logistics Guide**, I’ll now structure this into:

1. ✅ **Core Database Design (Tables / Collections)**  
2. ✅ **Key API Endpoints**  
3. ✅ **Order State Flow**  
4. ✅ **Wallet & Settlement Logic Design**  
5. ✅ **Minimum Order \+ Single Merchant Cart Logic**  
6. ✅ **Edge Functions Needed**

I’ll design this in a scalable way (MongoDB-friendly since you mentioned you’re using Mongo).

---

# **1️⃣ Core Database Design (MongoDB Collections)**

---

## **👤 Users Collection**

users  
{  
  \_id: ObjectId,  
  role: "customer" | "merchant" | "driver" | "admin",  
  fullName: String,  
  phone: String,  
  email: String,  
  country: "GH" | "NG" | "IN" | "US" | "CA" | "EU",  
  walletBalance: Number,  
  walletCurrency: String,  
  isActive: Boolean,  
  createdAt: Date  
}

---

## **🏪 Merchants Collection**

merchants  
{  
  \_id: ObjectId,  
  userId: ObjectId,  
  businessName: String,  
  category: "food" | "pharmacy" | "grocery" | "marketplace" | "rentals" | "services",  
  commissionRate: Number,      // e.g. 15  
  serviceFeeRate: Number,      // e.g. 8  
  pickupFeeRate: Number,       // optional  
  minOrderOverride: Number,    // optional custom MOV  
  mainBalance: Number,  
  pendingBalance: Number,  
  payoutThreshold: Number,  
  isVerified: Boolean  
}

---

## **📦 Products Collection**

Supports dynamic categories.

products  
{  
  \_id: ObjectId,  
  merchantId: ObjectId,  
  name: String,  
  description: String,  
  category: "food" | "pharmacy" | "rentals" | "services" | "general",  
  price: Number,  
  stockQuantity: Number,   // 999999 for services  
  images: \[String\],  
  tags: \[String\],

  // FOOD  
  customizations: \[  
    {  
      title: String, // e.g Protein  
      options: \[  
        { name: String, price: Number }  
      \]  
    }  
  \],

  // RENTALS  
  rentalDuration: "hourly" | "daily" | "weekly",  
  deposit: Number,

  // PHARMACY  
  expirationDate: Date,  
  dosageInfo: String,  
  prescriptionRequired: Boolean,

  // SERVICES  
  serviceDuration: Number, // in minutes

  isActive: Boolean,  
  createdAt: Date  
}

---

## **🛒 Cart Collection (Single Merchant Enforced)**

carts  
{  
  \_id: ObjectId,  
  userId: ObjectId,  
  merchantId: ObjectId,  // VERY IMPORTANT  
  items: \[  
    {  
      productId: ObjectId,  
      quantity: Number,  
      selectedOptions: \[  
        {  
          optionGroup: String,  
          optionName: String,  
          price: Number  
        }  
      \]  
    }  
  \],  
  subtotal: Number,  
  country: String,  
  updatedAt: Date  
}

### **🔒 Single Merchant Rule Logic**

When adding item:

* If cart.merchantId exists AND newProduct.merchantId \!== cart.merchantId  
  → Reject request.

---

## **📑 Orders Collection**

orders  
{  
  \_id: ObjectId,  
  orderNumber: String,  
  customerId: ObjectId,  
  merchantId: ObjectId,  
  driverId: ObjectId, // nullable

  items: \[...\],

  subtotal: Number,  
  serviceFee: Number,  
  commission: Number,  
  discountAmount: Number,  
  deliveryFee: Number,  
  totalAmount: Number,

  paymentMethod: "momo" | "card" | "cash",  
  paymentStatus: "pending" | "paid" | "escrowed" | "settled",

  deliveryType: "delivery" | "pickup",  
  pickupCode: String,

  status:   
    "pending" |  
    "accepted" |  
    "preparing" |  
    "ready" |  
    "driver\_assigned" |  
    "in\_transit" |  
    "delivered" |  
    "completed" |  
    "cancelled",

  country: String,  
  createdAt: Date  
}

---

## **💰 Wallet Transactions Collection**

wallet\_transactions  
{  
  \_id: ObjectId,  
  userId: ObjectId,  
  type: "credit" | "debit",  
  amount: Number,  
  reference: String,  
  description: String,  
  orderId: ObjectId,  
  createdAt: Date  
}

---

# **2️⃣ API Endpoints Design**

---

# **🔐 Auth**

POST   /api/auth/register  
POST   /api/auth/login  
GET    /api/auth/me

---

# **🏪 Merchant APIs**

POST   /api/merchant/product  
PUT    /api/merchant/product/:id  
DELETE /api/merchant/product/:id  
GET    /api/merchant/orders  
PATCH  /api/merchant/orders/:id/status  
GET    /api/merchant/finances  
POST   /api/merchant/request-payout

---

# **🛒 Cart APIs**

GET    /api/cart  
POST   /api/cart/add  
DELETE /api/cart/remove  
PATCH  /api/cart/update  
DELETE /api/cart/clear

Add-to-cart validation:

* Enforce Single Merchant  
* Enforce MOV (minimum order value)

---

# **🧾 Order APIs**

POST   /api/order/quote  
POST   /api/order/checkout  
GET    /api/order/:id  
GET    /api/customer/orders  
PATCH  /api/order/verify-pickup

---

# **🚗 Driver APIs**

GET    /api/driver/available-orders  
POST   /api/driver/accept/:orderId  
PATCH  /api/driver/status/:orderId

---

# **💰 Wallet APIs**

GET    /api/wallet  
GET    /api/wallet/transactions

---

# **3️⃣ Minimum Order Value (MOV) Logic**

Global Config Collection:

platform\_settings  
{  
  country: "GH",  
  minimumOrderValue: 50,  
  currency: "GHS"  
}

### **MOV Rules**

| Country | MOV |
| ----- | ----- |
| GH | 50 |
| NG | 5000 |
| IN | 500 |
| US | 25 |
| CA | 25 |
| EU | 25 |

---

### **Checkout Validation**

if (cart.subtotal \< MOV) {  
  throw Error("Add one more essential to unlock delivery")  
}

You can also calculate:

remainingAmount \= MOV \- cart.subtotal

And show:

“Add GHS 12 more to unlock delivery”

🔥 Great UX trick.

---

# **4️⃣ Cash Deduction Logic (CRITICAL PART)**

This is your competitive advantage.

---

## **🚚 DELIVERY (Cash)**

Driver collects cash.

System does:

merchantAmount \= subtotal \- commission \- serviceFee  
platformFee \= commission \+ serviceFee

DEBIT driver.wallet (merchantAmount \+ platformFee)  
CREDIT merchant.wallet (merchantAmount)

---

## **🚕 RIDES (Cash)**

DEBIT driver.wallet (platformShare)

---

## **🏪 PICKUP (Cash)**

Merchant collects cash.

DEBIT merchant.wallet (platformFee)

---

# **5️⃣ Escrow Logic (Momo & Card)**

Payment Flow:

1. Customer pays via Paystack  
2. Platform holds funds  
3. On:  
   * Delivery complete  
   * Pickup code verified

Then:

merchantAmount \= subtotal \- fees  
CREDIT merchant.wallet

---

# **6️⃣ Order State Flow**

### **DELIVERY FLOW**

pending → accepted → preparing → driver\_assigned →  
in\_transit → delivered → completed

---

### **PICKUP FLOW**

pending → accepted → preparing → ready →  
pickup\_code\_verified → completed

---

# **7️⃣ Pickup Code System**

When order created:

pickupCode \= generateRandom(6)

Store hashed version for security.

Verification endpoint:

PATCH /api/order/verify-pickup

If correct:

* Update order → completed  
* Trigger settlement

---

# **8️⃣ Smart UX Features**

### **🔥 Single Merchant Enforcement**

On add-to-cart:

if (cart.merchantId && cart.merchantId \!== product.merchantId)  
  return error("You can only order from one merchant at a time")

---

### **🔥 Smart Suggestion Message**

If subtotal \< MOV:

Return:

{  
  success: false,  
  remainingAmount: 12,  
  message: "Add GHS 12 more to unlock delivery"  
}

---

# **9️⃣ Suggested Edge Functions**

Since you're building modern architecture:

### **Edge Functions**

* `quoteOrder`  
* `settleCashOrder`  
* `releaseEscrowFunds`  
* `verifyPickupCode`  
* `assignDriver`  
* `applyCoupon`

---

# **🔟 High-Level System Architecture**

Client (App/Web)  
      ↓  
API Layer  
      ↓  
Business Logic Layer  
      ↓  
MongoDB  
      ↓  
Wallet Settlement Engine  
      ↓  
Paystack

---

# **🚀 Scalability Considerations**

* Use transaction sessions in MongoDB for wallet deduction  
* Use event-based settlement (OrderCompleted event)  
* Use background jobs for payout processing  
* Index on:  
  * merchantId  
  * customerId  
  * status  
  * createdAt

---

# **💡 Strategic Advice (Important)**

Peacefill, this design is strong.

Your real moat will be:

* The deduction-from-wallet cash model  
* Pickup code verification security  
* Single-merchant checkout (logistically clean)  
* Country-based MOV logic

This is structured enough to scale to:

* Ghana 🇬🇭  
* Nigeria 🇳🇬  
* India 🇮🇳  
* US 🇺🇸  
* Canada 🇨🇦  
* Europe 🇪🇺

---

If you want next, I can:

* Design the ER diagram visually  
* Write sample Mongo transaction code  
* Design the payout engine  
* Or design the driver matching algorithm

Tell me which direction we go next.

