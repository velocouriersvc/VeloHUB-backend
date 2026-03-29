import Prelude from "@prelude.so/sdk";
import dotenv from 'dotenv';
import { createServiceLogger } from '../utils/logger';
import { notificationEventsTotal } from '../utils/metrics';

dotenv.config();

const log = createServiceLogger('PreludeService');

export class PreludeService {
    private client: Prelude;

    constructor() {
        const apiToken = process.env.PRELUDE_API_KEY;
        if (!apiToken) {
            log.warn('Prelude API Key is missing from environment variables');
        }
        this.client = new Prelude({ 
            apiToken: apiToken || '' 
        });
    }

    /**
     * Sends a verification code via Prelude.
     * Prelude handles code generation and channel selection (SMS/WhatsApp).
     */
    async sendVerification(to: string): Promise<string> {
        try {
            const verification = await this.client.verification.create({
                target: {
                    type: "phone_number",
                    value: to,
                },
            });
            log.info('Verification sent successfully via Prelude', { id: verification.id });
            notificationEventsTotal.inc({ channel: 'prelude', status: 'success' });
            return verification.id;
        } catch (error) {
            log.error('Failed to send verification via Prelude', { error: (error as Error).message });
            notificationEventsTotal.inc({ channel: 'prelude', status: 'failed' });
            throw error;
        }
    }

    /**
     * Checks if the provided code is valid for the given phone number via Prelude.
     */
    async checkVerification(to: string, code: string): Promise<boolean> {
        try {
            const check = await this.client.verification.check({
                target: {
                    type: "phone_number",
                    value: to,
                },
                code: code,
            });
            log.info('Verification check completed via Prelude', { status: check.status });
            return check.status === 'success';
        } catch (error) {
            log.error('Failed to check verification via Prelude', { error: (error as Error).message });
            return false;
        }
    }

    /**
     * Sends a transactional SMS via Prelude Notify API.
     * Note: Requires a pre-configured template in Prelude dashboard.
     */
    async sendSMS(to: string, message: string): Promise<string> {
        return this.sendNotification(to, message, 'sms');
    }

    /**
     * Sends a transactional WhatsApp via Prelude Notify API.
     */
    async sendWhatsApp(to: string, message: string): Promise<string> {
        return this.sendNotification(to, message, 'whatsapp');
    }

    private async sendNotification(to: string, message: string, channel: 'sms' | 'whatsapp'): Promise<string> {
        const templateId = process.env.PRELUDE_NOTIFICATION_TEMPLATE_ID;
        if (!templateId) {
            const error = `PRELUDE_NOTIFICATION_TEMPLATE_ID is missing. Cannot send ${channel}.`;
            log.error(error);
            throw new Error(error);
        }

        try {
            // Using Prelude Notify API with a generic template
            // You might need multiple templates for different message types.
            const response = await this.client.notify.send({
                template_id: templateId,
                to,
                variables: {
                    message, // Template must have a {{message}} variable
                }
            });
            log.info(`${channel.toUpperCase()} sent via Prelude Notify`, { id: response.id });
            return response.id;
        } catch (error) {
            log.error(`Failed to send ${channel} via Prelude`, { error: (error as Error).message });
            throw error;
        }
    }
}
