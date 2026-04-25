import { EmailService } from './src/services/email-service';
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log('Testing Email Service...');
    const success = await EmailService.send({
        to: "danielkojo005@gmail.com",
        subject: 'Test Email from Velo API',
        text: 'This is a test email to verify SMTP configuration.'
    });
    console.log('Success:', success);
}

test().catch(console.error);
