import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

export class TwilioService {
    private client: twilio.Twilio;
    private fromNumber: string;
    private whatsappNumber: string;

    constructor() {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
        this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || this.fromNumber;

        if (!accountSid || !authToken || !this.fromNumber) {
            console.warn('Twilio credentials or phone number are missing from environment variables.');
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
}
