import { TwilioService } from '../services/twilio-service';

/**
 * standalone script to test Twilio SMS and WhatsApp functionality.
 * Usage: npx ts-node src/scripts/test-twilio.ts <recipient_phone_number>
 */

async function main() {
    const to = process.argv[2];

    if (!to) {
        console.error('Error: Please provide a recipient phone number (e.g., +1234567890).');
        console.log('Usage: npx ts-node src/scripts/test-twilio.ts <recipient_phone_number>');
        process.exit(1);
    }

    /*
     ## Troubleshooting Delivery Issues

    If you saw the "SMS Test Passed" but didn't get the message, or if the WhatsApp test failed:

    ### 1. WhatsApp Fix (Error 63007)
    Your toll-free number (+1 844) isn't enabled for WhatsApp by default.
    - **Action**: Go to **Messaging** > **Try it out** > **Send a WhatsApp message** in Twilio.
    - **Action**: Copy the **Sandbox Number** (e.g., `+1 415 523 8886`).
    - **Action**: Update your `.env` file:
      ```env
      TWILIO_WHATSAPP_NUMBER=+14155238886
      ```

    ### 2. SMS Fix (+233 Ghana)
    Toll-free numbers (+1 844) are primarily for US/Canada and often **cannot** send international SMS.
    - **Action**: In Twilio Console, go to **Messaging** > **Settings** > **Geo-Permissions** and ensure **Ghana** is enabled.
    - **Recommendation**: If it still fails, you may need to purchase a **Local US Number** (not toll-free) or a number from a region that supports international sending.

    ## How to Test
    Once you've updated your `.env` and Twilio settings, run:
    ```bash
    npx ts-node src/scripts/test-twilio.ts <your_phone_number>
    ```
    */

    const twilioService = new TwilioService();

    async function pollStatus(sid: string, type: string) {
        console.log(`\nWaiting for ${type} delivery status...`);
        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            const statusInfo = await twilioService.getMessageStatus(sid);
            console.log(`[Attempt ${i + 1}] Status: ${statusInfo.status}`);

            if (statusInfo.status === 'delivered') {
                console.log(`✅ ${type} was DELIVERED.`);
                return;
            } else if (statusInfo.status === 'failed' || statusInfo.status === 'undelivered') {
                console.log(`❌ ${type} FAILED: ${statusInfo.errorMessage} (Error Code: ${statusInfo.errorCode})`);
                console.log(`More info: https://www.twilio.com/docs/errors/${statusInfo.errorCode}`);
                return;
            }
        }
        console.log(`⌛ Status is still '${type === 'SMS' ? 'sent' : 'delivered'}' (queued) after 15 seconds. Check the console later.`);
    }

    console.log(`--- Testing SMS to ${to} ---`);
    try {
        const smsSid = await twilioService.sendSMS(to, 'This is a test SMS from Velo Hub.');
        console.log(`SMS accepted by Twilio. SID: ${smsSid}`);
        await pollStatus(smsSid, 'SMS');
    } catch (error) {
        console.error('SMS Test Failed at send step.');
    }

    console.log(`\n--- Testing WhatsApp to ${to} ---`);
    try {
        const waSid = await twilioService.sendWhatsApp(to, 'This is a test WhatsApp message from Velo Hub.');
        console.log(`WhatsApp accepted by Twilio. SID: ${waSid}`);
        await pollStatus(waSid, 'WhatsApp');
    } catch (error) {
        console.error('WhatsApp Test Failed at send step.');
    }
}

main().catch(console.error);
