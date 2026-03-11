import twilio from 'twilio';
import dotenv from 'dotenv';
import { createServiceLogger } from '../utils/logger';
import { notificationEventsTotal } from '../utils/metrics';

dotenv.config();

const log = createServiceLogger('TwilioService');

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
            log.warn('Twilio credentials, phone number, or Verify Service SID are missing from environment variables');
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
            log.info('SMS sent successfully', { sid: message.sid });
            notificationEventsTotal.inc({ channel: 'sms', status: 'success' });
            return message.sid;
        } catch (error) {
            log.error('Failed to send SMS', { error: (error as Error).message });
            notificationEventsTotal.inc({ channel: 'sms', status: 'failed' });
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
            log.info('WhatsApp message sent successfully', { sid: message.sid });
            notificationEventsTotal.inc({ channel: 'whatsapp', status: 'success' });
            return message.sid;
        } catch (error) {
            log.error('Failed to send WhatsApp message', { error: (error as Error).message });
            notificationEventsTotal.inc({ channel: 'whatsapp', status: 'failed' });
            throw error;
        }
    }

    async getMessageStatus(sid: string): Promise<{ status: string; errorCode: number | null; errorMessage: string | null; dateUpdated: Date }> {
        try {
            const message = await this.client.messages(sid).fetch();
            return {
                status: message.status,
                errorCode: message.errorCode,
                errorMessage: message.errorMessage,
                dateUpdated: message.dateUpdated
            };
        } catch (error) {
            log.error('Failed to fetch message status', { sid, error: (error as Error).message });
            throw error;
        }
    }

    async sendVerification(to: string, channel: 'sms' | 'whatsapp' = 'sms'): Promise<{ status: string; sid: string }> {
        try {
            const verification = await this.client.verify.v2
                .services(this.verifyServiceSid)
                .verifications.create({ to, channel });
            log.info('Verification sent', { channel, status: verification.status });
            return verification;
        } catch (error) {
            log.error('Failed to send verification', { channel, error: (error as Error).message });
            throw error;
        }
    }

    async checkVerification(to: string, code: string): Promise<boolean> {
        try {
            const check = await this.client.verify.v2
                .services(this.verifyServiceSid)
                .verificationChecks.create({ to, code });
            log.info('Verification check completed', { status: check.status });
            return check.status === 'approved';
        } catch (error) {
            log.error('Failed to check verification', { error: (error as Error).message });
            return false;
        }
    }
}
