# Twilio Console Navigation Guide

This guide provides step-by-step instructions on how to navigate the Twilio Console to fix SMS and WhatsApp delivery issues.

## 1. Check if you have a Trial Account
Twilio Trial accounts have strict restrictions (you can only send to your own verified number).

1.  Look at the **Top Navigation Bar** in the Twilio Console.
2.  Next to your Account Name, it will say **"Trial"** in a small badge if you are on a trial account.
3.  If it says **"Trial"**, you **MUST** follow Step 4 (Verified Caller IDs) for every number you want to text.

---

## 2. Fix WhatsApp "From Address" Error
If you get error `63007` ("Twilio could not find a Channel with the specified From address"), you need to use the Sandbox number.

1.  Log in to the **[Twilio Console](https://console.twilio.com/)**.
2.  In the left sidebar, click **Messaging**.
3.  Click **Try it out**.
4.  Click **Send a WhatsApp message**.
5.  On this page, you will see a **Sandbox Number** (e.g., `+1 415 523 8886`).
6.  **Action**: Copy this number and paste it as `TWILIO_WHATSAPP_NUMBER` in your `.env` file.
7.  **Action**: Follow the instruction on that same page to "Join" the sandbox from your phone (e.g., text `join <word>` to that number).

---

## 2. Enable SMS for Ghana (Geo-Permissions)
If your SMS "Passes" in the script but you never receive it, it might be blocked by country-level permissions.

1.  In the **Twilio Console**, go to the left sidebar.
2.  Click **Messaging**.
3.  Click **Settings**.
4.  Click **Geo-Permissions**.
5.  Search for **Ghana** in the list.
6.  **Action**: Check the box next to **Ghana** to enable SMS delivery to that country.
7.  Click **Save** at the bottom of the page.

---

## 3. Verify Your Phone Number (Trial Accounts)
If your account is a "Trial Account", you can only send messages to numbers you have verified.

1.  In the **Twilio Console**, go to the left sidebar.
2.  Click **Phone Numbers**.
3.  Click **Manage**.
4.  Click **Verified Caller IDs**.
5.  **Action**: Click the **Add a new Caller ID** button (or the `+` icon).
6.  Enter your phone number (`+233...`) and verify it via the code Twilio sends you.

---

## 5. View "Real" Error Logs (CRITICAL for Debugging)
If your script says "Passed" but you haven't received anything, or if it says "Failed", **Twilio's Internal Logs** will tell you exactly why.

1.  Log in to **Twilio**.
2.  Click **Monitor** in the left sidebar menu (usually a speedometer icon).
3.  Click **Logs** > **Messaging**.
4.  You will see a table of messages. Look for the row with your number `+233...`.
5.  Look at the **Status** column (e.g., "Undelivered", "Failed", "Sent").
6.  **Click on the message SID** (the blue link like `SM...`) to see full details.
7.  Scroll down to the **Error Code** section. This is the "Truth" of why it failed.

---

## 7. The "Phantom Delivery" Issue (Status: Delivered but not received)
If the test script says **✅ SMS was DELIVERED** but your phone never vibrated:

-   **What it means**: Twilio successfully handed the message to the **Ghanaian Carrier**. The carrier then reported back "Success" to Twilio, but internally chose to **drop/block** the message before it reached your handset.
-   **The Culprit**: **Toll-Free Numbers (+1 844)**. Ghanaian carriers (like MTN, Vodafone, AirtelTigo) are extremely aggressive. They see a +1 844 number and assume it's bulk spam, so they "silent-drop" it.

### The Definitive Fix:
1.  **Buy a Local US Number**:
    - Go to **Phone Numbers** > **Manage** > **Buy a Number**.
    - Search for a US number, but set the **Number Type** filter to **"Local"** (NOT Toll-Free).
2.  **Update .env**:
    - Replace `TWILIO_PHONE_NUMBER` with your new Local number.
3.  **Carrier Registration (Optional but Recommended)**:
    - If you are sending OTPs, international carriers prefer messages from **Local numbers** over **Toll-Free**.
