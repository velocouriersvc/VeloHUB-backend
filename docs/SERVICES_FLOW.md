# Velo Services Flow Documentation

This document outlines the detailed end-to-end flow for "Services" in the Velo application. It covers how merchants register to offer services, how customers gain access to and book these services, and how the orders are managed by the merchant.

## 1. Overview of the Services Flow

The services vertical operates differently from standard e-commerce or food delivery orders on the platform:

*   **Subscription Paywall**: Customers are required to have an active subscription (100 GHS/month) to browse and book services.
*   **Dedicated Flow**: Unlike physical items that go through the cart, services are booked directly through a specific "Book Service" flow, resulting in a `service_booking` entity rather than a standard order.
*   **Payment Method**: Service bookings only support digital payments (Card or Momo via Paystack) and do not support cash on delivery.

## 2. Merchant Registration for Services

Merchants sign up and manage their profile via the Seller Setup flow.

**Signup Flow (`app/auth/seller-setup.tsx`)**

*   **Role Selection**: When creating an account, the user selects the "Merchant" role (`app/auth/role-selection.tsx`).
*   **Business Details**: The user is prompted to enter their:
    *   Business Name
    *   Business Type (They can explicitly select "Services" from the dropdown list)
    *   Business Address (using geolocation map picker)
    *   Email Address
*   **Identity Verification**: The merchant is required to upload the Front and Back of their Ghana Card and enter a valid Ghana Card number for PCSRC compliance.
*   **Creation**: Upon submission, the platform creates a record in the `merchants` database table, links the user's profiles, and assigns the `merchant` role.
*   **Adding Service Products**: Once registered, the merchant can use their seller dashboard (`app/(seller-tabs)/add-product.tsx`) to add specific service listings under the "Services" category.

## 3. Customer Experience & Subscription Paywall

To view services, customers navigate to the Services tab from the home screen (`app/(tabs)/(home)/services.tsx`).

**The Subscription Paywall**

*   **Access Check**: When the customer opens the Services page, the app checks if the user has active access (`PaymentAPI.checkServicesAccess()`).
*   **Access Wall Component**: If they don't have access, they are presented with a `ServicesAccessWall` component blocking the view of the services.
*   **Payment Initiation**: Pressing the button to request access initiates a Paystack payment session for exactly 100 GHS/month (`PaymentAPI.initServicesSubscription()`).
*   **Confirmation**: The user completes the payment via a Paystack WebView. The app continuously polls the database for up to 30 seconds to verify that the `has_services_access` flag on the user's profile has been updated by the payment webhook.
*   **Access Granted**: Once confirmed, the page reloads, and the customer can now see the "Services" category, including all vendors classified as service providers and their service listings.

## 4. Customer Booking Flow

When a customer finds a service they want to hire, the booking flow initiates directly without going through the standard cart system.

**Booking Process (`app/(tabs)/(home)/book-service.tsx`)**

*   **Service Selection**: The user taps "Book" on a service card. They are navigated to the `BookServiceScreen` with the `productId`, `merchantId`, `title`, and `price` passed as parameters.
*   **Booking Details Form**:
    *   **Service address**: (Required) Where the service professional needs to go.
    *   **Preferred time**: (Optional) Options include "Morning", "Afternoon", or "Evening".
    *   **Notes**: (Optional) Specific instructions (e.g., "Leaky sink, need before 12pm").
    *   **Payment Method**: Customers select between Card or Momo. Cash is not supported for service bookings. The minimum booking amount must be at least GH₵ 1.00.
*   **Execution**:
    *   A new record is inserted into the `service_bookings` table using `ServiceBookingAPI.createBooking()`. Initially, its status is `requested` and payment status is `pending`.
    *   The app immediately calls `ServiceBookingAPI.initiatePayment()` to start a Paystack transaction for the booking.
    *   The user finishes the payment through the Expo WebBrowser. Once done, they are redirected to their "My Service Bookings" screen.

## 5. Merchant Order Management Flow

Merchants manage their received service requests from a dedicated dashboard tailored for services.

**Merchant Service Bookings (`app/(seller-tabs)/service-bookings.tsx`)**

*   **View Requests**: Merchants navigate to their "Service Bookings" tab, which fetches requests using `ServiceBookingAPI.getMerchantBookings()`.
*   **Review**: A new booking appears with the badge `Pending` (status `requested`). The merchant sees the service requested, the price, the address, and the preferred time.
*   **Accept/Decline**:
    *   **Accept**: The merchant clicks "Accept". The status updates to `accepted`.
    *   **Decline**: The merchant can reject the service, moving the status to `declined` with a default decline reason.
*   **Start Job**: When the scheduled time arrives, the merchant clicks "Start job" transitioning the status to `in_progress`.
*   **Complete**: Once the service is rendered, the merchant marks it as "Mark complete", updating the status to `completed` and locking the booking flow.

## 6. Customer Order Tracking

Customers can track the real-time status of their requested services.

**Customer Dashboard (`app/(tabs)/service-bookings.tsx` & `service-booking-detail.tsx`)**

*   **List View**: Customers can see a list of all their historical and active service requests (`ServiceBookingAPI.getMyBookings()`).
*   **Detail View**: Clicking on a specific booking shows the full details, including dynamic status updates from the provider:
    *   Waiting for provider to accept (`requested`)
    *   Accepted
    *   Declined
    *   Scheduled
    *   In progress
    *   Completed
    *   Cancelled
*   **Payment Status**: Customers can also verify whether their payment was successfully processed (`Paid` vs `Pending`).

## 7. Database Architecture

Service bookings use entirely separate database tables from normal food/grocery orders to handle the unique state transitions and paywall access.

### 1. `service_subscriptions` Table
Tracks the customer's 100 GHS/month access charge.
*   `profile_id`: References the user.
*   `status`: `active`, `pending`, `cancelled`, or `expired`.
*   `current_period_end`: Expiration timestamp.

### 2. `profiles` Table
Contains a boolean flag: `has_services_access`, synced with the subscription status via webhooks for fast UI querying.

### 3. `service_bookings` Table
The core table representing the service booking.
*   `booking_number`: Unique identifier (e.g., SRV-20260324-ABCDEF).
*   `customer_id`, `merchant_id`, `product_id`: Core relations.
*   `service_title`, `price`: Snapshot of what was booked.
*   `preferred_date`, `preferred_time_slot`, `service_address`, `customer_notes`: Booking metadata.
*   `status`: The state machine enum (`requested`, `accepted`, `declined`, `scheduled`, `in_progress`, `completed`, `cancelled`).
*   `payment_method`: Strictly constrained to `card`, `wallet`, or `momo`.
*   `payment_status`: `pending`, `paid`, or `refunded`.
*   `scheduled_at`, `started_at`, `completed_at`, `declined_at`: Explicit audit timestamps for state transitions.

## 8. API Map

All frontend interfaces communicate with the Supabase backend via `services/api.ts`.
*   `PaymentAPI.checkServicesAccess()`: Checks `profiles.has_services_access`.
*   `PaymentAPI.initServicesSubscription()`: Triggers the Edge Function `/paystack-init` for subscriptions.
*   `ServiceBookingAPI.createBooking()`: Directly inserts into `public.service_bookings`.
*   `ServiceBookingAPI.initiatePayment()`: Calls the `/paystack-init-booking` Edge Function.
*   `ServiceBookingAPI.updateStatus()`: Used by merchants to transition state machines (`accepted`, `in_progress`, `completed`, etc.).
