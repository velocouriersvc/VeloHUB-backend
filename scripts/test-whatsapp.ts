import { TwilioService } from '../src/Services/twilio-service';

const main = async () => {
    const args = process.argv.slice(2);
    const phoneNumber = args[0];

    if (!phoneNumber) {
        console.error('Please provide a phone number to send a test WhatsApp message to.');
        console.error('Usage: npx ts-node scripts/test-whatsapp.ts <phone_number>');
        process.exit(1);
    }

    console.log(`Sending test WhatsApp message to ${phoneNumber}...`);

    const twilioService = new TwilioService();
    try {
        await twilioService.sendWhatsApp(phoneNumber, 'This is a test WhatsApp message from your Velo Backend!');
        console.log('Test WhatsApp sent successfully!');
    } catch (error) {
        console.error('Failed to send test WhatsApp.');
    }
};

main();
