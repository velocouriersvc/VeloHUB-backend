/**
 * Mock for `expo-server-sdk` (ESM-only package that jest can't transform).
 *
 * NotificationService constructs `new Expo(...)` at init and calls the static
 * `Expo.isExpoPushToken` plus instance chunk/send helpers. This stub keeps the
 * shape so importing services doesn't blow up under jest.
 */
export type ExpoPushMessage = Record<string, any>;
export type ExpoPushTicket = Record<string, any>;

export class Expo {
    constructor(_opts?: any) {}
    static isExpoPushToken(_token: string): boolean {
        return true;
    }
    chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][] {
        return messages.length ? [messages] : [];
    }
    async sendPushNotificationsAsync(_chunk: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
        return [];
    }
}

export default { Expo };
