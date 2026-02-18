import { TwilioService } from '../src/Services/twilio-service';

const main = async () => {
    const args = process.argv.slice(2);
    const phoneNumber = args[0];

    if (!phoneNumber) {
        console.error('Please provide a phone number to send a test SMS to.');
        console.error('Usage: npx ts-node scripts/test-sms.ts <phone_number>');
        process.exit(1);
    }

    console.log(`Sending test SMS to ${phoneNumber}...`);

    const twilioService = new TwilioService();
    try {
        await twilioService.sendSMS(phoneNumber, 'This is a test message from your Velo Backend Twilio Service.');
        console.log('Test SMS sent successfully!');
    } catch (error) {
        console.error('Failed to send test SMS.');
        // Error is already logged in the service
    }
};

main();
