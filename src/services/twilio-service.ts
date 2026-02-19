import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

export class TwilioService {
    private client: twilio.Twilio;
    private fromNumber: string;
    private whatsappNumber: string;
    private verifyServiceSid: string;

    constructor() {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
        this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || this.fromNumber;
        this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID || '';

        if (!accountSid || !authToken || !this.fromNumber || !this.verifyServiceSid) {
            console.warn('Twilio credentials, phone number, or Verify Service SID are missing from environment variables.');
        }

        this.client = twilio(accountSid, authToken);
    }

    async sendSMS(to: string, body: string): Promise<string> {
        try {
            const message = await this.client.messages.create({
                body,
                from: this.fromNumber,
                to,
            });
            console.log(`SMS sent successfully to ${to}. SID: ${message.sid}`);
            return message.sid;
        } catch (error) {
            console.error(`Failed to send SMS to ${to}:`, error);
            throw error;
        }
    }

    async sendWhatsApp(to: string, body: string): Promise<string> {
        try {
            const from = `whatsapp:${this.whatsappNumber}`;
            const toWhatsApp = `whatsapp:${to}`;

            const message = await this.client.messages.create({
                body,
                from,
                to: toWhatsApp,
            });
            console.log(`WhatsApp message sent successfully to ${to}. SID: ${message.sid}`);
            return message.sid;
        } catch (error) {
            console.error(`Failed to send WhatsApp message to ${to}:`, error);
            throw error;
        }
    }

    async getMessageStatus(sid: string): Promise<any> {
        try {
            const message = await this.client.messages(sid).fetch();
            return {
                status: message.status,
                errorCode: message.errorCode,
                errorMessage: message.errorMessage,
                dateUpdated: message.dateUpdated
            };
        } catch (error) {
            console.error(`Failed to fetch status for SID ${sid}:`, error);
            throw error;
        }
    }

    async sendVerification(to: string, channel: 'sms' | 'whatsapp' = 'sms'): Promise<any> {
        try {
            const verification = await this.client.verify.v2
                .services(this.verifyServiceSid)
                .verifications.create({ to, channel });
            console.log(`Verification sent to ${to} via ${channel}. Status: ${verification.status}`);
            return verification;
        } catch (error) {
            console.error(`Failed to send verification to ${to}:`, error);
            throw error;
        }
    }

    async checkVerification(to: string, code: string): Promise<boolean> {
        try {
            const check = await this.client.verify.v2
                .services(this.verifyServiceSid)
                .verificationChecks.create({ to, code });
            console.log(`Verification check for ${to}. Status: ${check.status}`);
            return check.status === 'approved';
        } catch (error) {
            console.error(`Failed to check verification for ${to}:`, error);
            return false;
        }
    }
}
