const { EmailService } = require('./dist/services/email-service');
require('dotenv').config();

async function test() {
    console.log('Testing Email Service (JS)...');
    const success = await EmailService.send({
        to: 'info@velocouriersvc.com',
        subject: 'Test Email from Velo API',
        text: 'This is a test email to verify SMTP configuration.'
    });
    console.log('Success:', success);
}

test().catch(console.error);
