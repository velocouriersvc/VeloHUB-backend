import Prelude from "@prelude.so/sdk";
import dotenv from 'dotenv';
import { createServiceLogger } from '../utils/logger';
import { notificationEventsTotal } from '../utils/metrics';

dotenv.config();

const log = createServiceLogger('PreludeService');

export class PreludeService {
    private client: Prelude;

    constructor() {
        // The SDK looks for process.env.API_TOKEN by default
        this.client = new Prelude();
        
        if (!process.env.API_TOKEN) {
            log.warn('API_TOKEN is missing from environment variables');
        }
    }

    /**
     * Sends a verification code via Prelude.
     * Prelude handles code generation and channel selection (SMS/WhatsApp).
     */
    async sendVerification(to: string): Promise<string> {
        const senderId = process.env.PRELUDE_SENDER_ID;
        try {
            const verification = await this.createVerification(to, senderId);
            log.info('Verification sent successfully via Prelude', { id: verification.id, senderId });
            notificationEventsTotal.inc({ channel: 'prelude', status: 'success' });
            return verification.id;
        } catch (error) {
            // A registered alphanumeric sender_id can be rejected for some destinations
            // (notably Nigeria/+234). Retry once WITHOUT it so Prelude picks a default
            // route, rather than leaving that country's users unable to receive a code.
            if (senderId) {
                try {
                    const verification = await this.createVerification(to, undefined);
                    log.info('Verification sent via Prelude on sender_id-less retry', { id: verification.id });
                    notificationEventsTotal.inc({ channel: 'prelude', status: 'success' });
                    return verification.id;
                } catch (retryError) {
                    log.error('Failed to send verification via Prelude (retry without sender_id)', { error: (retryError as Error).message });
                    notificationEventsTotal.inc({ channel: 'prelude', status: 'failed' });
                    throw retryError;
                }
            }
            log.error('Failed to send verification via Prelude', { error: (error as Error).message });
            notificationEventsTotal.inc({ channel: 'prelude', status: 'failed' });
            throw error;
        }
    }

    /** Create a Prelude verification, optionally with a sender_id. */
    private createVerification(to: string, senderId?: string) {
        return this.client.verification.create({
            target: { type: "phone_number", value: to },
            ...(senderId ? { options: { sender_id: senderId } } : {}),
        });
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
