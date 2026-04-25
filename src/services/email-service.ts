import * as net from 'net';

/* ─────────────────────────────────────────────
 *  EmailService — lightweight SMTP client
 *
 *  Sends email via Postfix (port 25, no auth) when running in K8s,
 *  or via an authenticated SMTP relay (Gmail, Brevo, etc.).
 *
 *  Zero external dependencies — uses raw TCP sockets.
 *  If you prefer nodemailer, swap the `send()` implementation.
 *
 *  Env vars (injected from ConfigMap / Secret):
 *    SMTP_HOST       – e.g. 10.42.0.1 (pod gateway → host Postfix)
 *    SMTP_PORT       – e.g. 25
 *    SMTP_FROM       – e.g. noreply@velocouriersvc.com
 *    SMTP_FROM_NAME  – e.g. Velo Courier
 *    SMTP_AUTH       – "true" to enable LOGIN auth (Gmail relay)
 *    SMTP_USER       – username (only when AUTH is true)
 *    SMTP_PASSWORD   – password (only when AUTH is true)
 *    SMTP_SECURE     – "true" for implicit TLS (port 465)
 * ───────────────────────────────────────────── */

interface Attachment {
    filename: string;
    content: string; // Base64 encoded string
    contentType: string;
}

interface EmailOptions {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: Attachment[];
}

interface SmtpConfig {
    host: string;
    port: number;
    from: string;
    fromName: string;
    auth: boolean;
    user: string;
    password: string;
}

function getConfig(): SmtpConfig {
    return {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '25', 10),
        from: process.env.SMTP_FROM || 'noreply@velocouriersvc.com',
        fromName: process.env.SMTP_FROM_NAME || 'Velo Courier',
        auth: process.env.SMTP_AUTH === 'true',
        user: process.env.SMTP_USER || '',
        password: process.env.SMTP_PASSWORD || '',
    };
}

/* ── Raw SMTP conversation over a TCP socket ── */

function smtpCommand(
    socket: net.Socket,
    command: string,
    expectedCode: string,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const onData = (data: Buffer) => {
            const response = data.toString();
            socket.removeListener('data', onData);
            if (response.startsWith(expectedCode)) {
                resolve(response);
            } else {
                reject(new Error(`SMTP error: expected ${expectedCode}, got: ${response.trim()}`));
            }
        };
        socket.on('data', onData);
        socket.write(command + '\r\n');
    });
}

function waitForGreeting(socket: net.Socket): Promise<string> {
    return new Promise((resolve, reject) => {
        const onData = (data: Buffer) => {
            const response = data.toString();
            socket.removeListener('data', onData);
            if (response.startsWith('220')) {
                resolve(response);
            } else {
                reject(new Error(`SMTP greeting error: ${response.trim()}`));
            }
        };
        socket.on('data', onData);
    });
}

export class EmailService {
    /* ── Public API ── */

    static async send(options: EmailOptions): Promise<boolean> {
        const cfg = getConfig();

        if (!cfg.host) {
            if (process.env.NODE_ENV === 'development') {
                console.log('--------------------------------------------------');
                console.log('📧 [EmailService] DEVELOPMENT MODE — SIMULATING SEND');
                console.log(`To: ${options.to}`);
                console.log(`Subject: ${options.subject}`);
                if (hasAttachments) {
                    console.log(`Attachments: ${options.attachments?.map(a => a.filename).join(', ')}`);
                }
                console.log('--------------------------------------------------');
                return true;
            }
            console.warn('[EmailService] SMTP_HOST not set — skipping email');
            return false;
        }

        const recipients = Array.isArray(options.to) ? options.to : [options.to];
        const fromHeader = `${cfg.fromName} <${cfg.from}>`;
        const body = options.html || options.text || '';
        const isHtml = !!options.html;
        const hasAttachments = options.attachments && options.attachments.length > 0;

        let messageLines: string[] = [
            `From: ${fromHeader}`,
            `To: ${recipients.join(', ')}`,
            `Subject: ${options.subject}`,
            `MIME-Version: 1.0`,
            `Date: ${new Date().toUTCString()}`,
        ];

        if (hasAttachments) {
            const boundary = `----=_Part_${Math.random().toString(36).substring(2)}`;
            messageLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, ``);

            // Add body part
            messageLines.push(`--${boundary}`);
            messageLines.push(`Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=UTF-8`);
            messageLines.push(`Content-Transfer-Encoding: 7bit`, ``);
            messageLines.push(body);

            // Add attachments
            for (const att of options.attachments!) {
                messageLines.push(`--${boundary}`);
                messageLines.push(`Content-Type: ${att.contentType}; name="${att.filename}"`);
                messageLines.push(`Content-Transfer-Encoding: base64`);
                messageLines.push(`Content-Disposition: attachment; filename="${att.filename}"`, ``);
                messageLines.push(att.content);
            }

            messageLines.push(`--${boundary}--`);
        } else {
            messageLines.push(`Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=UTF-8`, ``);
            messageLines.push(body);
        }

        const message = messageLines.join('\r\n');

        return new Promise((resolve) => {
            const socket = net.createConnection(cfg.port, cfg.host, () => {
                /* connection established — SMTP conversation starts in waitForGreeting */
            });

            socket.setTimeout(15_000);

            socket.on('timeout', () => {
                console.error('[EmailService] SMTP connection timed out');
                socket.destroy();
                resolve(false);
            });

            socket.on('error', (err) => {
                console.error('[EmailService] SMTP socket error:', err.message);
                resolve(false);
            });

            (async () => {
                try {
                    await waitForGreeting(socket);
                    await smtpCommand(socket, `EHLO velo-api`, '250');

                    /* Optional AUTH LOGIN (for Gmail relay, etc.) */
                    if (cfg.auth && cfg.user && cfg.password) {
                        await smtpCommand(socket, 'AUTH LOGIN', '334');
                        await smtpCommand(
                            socket,
                            Buffer.from(cfg.user).toString('base64'),
                            '334',
                        );
                        await smtpCommand(
                            socket,
                            Buffer.from(cfg.password).toString('base64'),
                            '235',
                        );
                    }

                    await smtpCommand(socket, `MAIL FROM:<${cfg.from}>`, '250');

                    for (const rcpt of recipients) {
                        await smtpCommand(socket, `RCPT TO:<${rcpt}>`, '250');
                    }

                    await smtpCommand(socket, 'DATA', '354');
                    await smtpCommand(socket, `${message}\r\n.`, '250');
                    await smtpCommand(socket, 'QUIT', '221');

                    socket.end();
                    console.log(`[EmailService] sent to ${recipients.join(', ')}`);
                    resolve(true);
                } catch (err: any) {
                    console.error('[EmailService] SMTP conversation failed:', err.message);
                    socket.destroy();
                    resolve(false);
                }
            })();
        });
    }

    /* ── Convenience methods ── */

    static async sendOrderConfirmation(
        to: string,
        orderId: string,
        total: string,
        currency: string,
    ): Promise<boolean> {
        return this.send({
            to,
            subject: `Order Confirmed — #${orderId}`,
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Velo Courier</h2>
                    <p>Your order <strong>#${orderId}</strong> has been confirmed.</p>
                    <p>Total: <strong>${currency} ${total}</strong></p>
                    <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
                        This is an automated message from Velo Courier Service.
                    </p>
                </div>
            `,
        });
    }

    static async sendDriverAssigned(
        to: string,
        driverName: string,
        estimatedTime: string,
    ): Promise<boolean> {
        return this.send({
            to,
            subject: `Driver Assigned — ${driverName}`,
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Velo Courier</h2>
                    <p>Your driver <strong>${driverName}</strong> is on the way.</p>
                    <p>Estimated arrival: <strong>${estimatedTime}</strong></p>
                    <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
                        This is an automated message from Velo Courier Service.
                    </p>
                </div>
            `,
        });
    }

    static async sendDeliveryComplete(
        to: string,
        orderId: string,
    ): Promise<boolean> {
        return this.send({
            to,
            subject: `Delivery Complete — #${orderId}`,
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Velo Courier</h2>
                    <p>Your order <strong>#${orderId}</strong> has been delivered! 🎉</p>
                    <p>Thank you for using Velo Courier.</p>
                    <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
                        This is an automated message from Velo Courier Service.
                    </p>
                </div>
            `,
        });
    }

    static async sendOtp(to: string, code: string): Promise<boolean> {
        return this.send({
            to,
            subject: `Your Velo verification code: ${code}`,
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Velo Courier</h2>
                    <p>Your verification code is:</p>
                    <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; margin: 24px 0;">${code}</p>
                    <p>This code expires in 10 minutes.</p>
                    <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
                        If you didn't request this, please ignore this email.
                    </p>
                </div>
            `,
        });
    }

    static async sendWelcome(to: string, name: string): Promise<boolean> {
        return this.send({
            to,
            subject: `Welcome to Velo Courier, ${name}!`,
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Welcome to Velo! 🚀</h2>
                    <p>Hi <strong>${name}</strong>,</p>
                    <p>Your account has been created. You can now book rides, order from merchants, and more.</p>
                    <p>If you have any questions, reply to this email or contact support.</p>
                    <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
                        — The Velo Courier Team
                    </p>
                </div>
            `,
        });
    }

    /** Check if SMTP is configured */
    static isConfigured(): boolean {
        return !!process.env.SMTP_HOST;
    }
}
