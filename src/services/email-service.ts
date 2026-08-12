import * as net from 'net';
import * as tls from 'tls';

/* ─────────────────────────────────────────────
 *  EmailService - lightweight SMTP client
 *
 *  Sends email via Postfix (port 25, no auth) when running in K8s,
 *  or via an authenticated SMTP relay (Gmail, Brevo, etc.).
 *
 *  Zero external dependencies - uses raw TCP sockets.
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
    secure: boolean;
}

function getConfig(): SmtpConfig {
    return {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '25', 10),
        from: process.env.SMTP_FROM || 'noreply@velocouriersvc.com',
        fromName: process.env.SMTP_FROM_NAME || 'Velo Courier Services',
        auth: process.env.SMTP_AUTH === 'true',
        user: process.env.SMTP_USER || '',
        password: process.env.SMTP_PASSWORD || '',
        secure: process.env.SMTP_SECURE === 'true',
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
        const hasAttachments = !!(options.attachments && options.attachments.length > 0);

        if (!cfg.host) {
            if (process.env.NODE_ENV === 'development') {
                console.log('--------------------------------------------------');
                console.log('📧 [EmailService] DEVELOPMENT MODE - SIMULATING SEND');
                console.log(`To: ${options.to}`);
                console.log(`Subject: ${options.subject}`);
                if (hasAttachments) {
                    console.log(`Attachments: ${options.attachments?.map(a => a.filename).join(', ')}`);
                }
                console.log('--------------------------------------------------');
                return true;
            }
            console.warn('[EmailService] SMTP_HOST not set - skipping email');
            return false;
        }

        const recipients = Array.isArray(options.to) ? options.to : [options.to];
        const fromHeader = `${cfg.fromName} <${cfg.from}>`;
        const body = options.html || options.text || '';
        const isHtml = !!options.html;

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
            const socket = cfg.secure 
                ? tls.connect({ port: cfg.port, host: cfg.host }) 
                : net.createConnection({ port: cfg.port, host: cfg.host });

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
                    
                    if (process.env.NODE_ENV === 'development') {
                        console.log('📧 [EmailService] FALLBACK TO SIMULATION (Real SMTP failed)');
                        console.log(`To: ${options.to}`);
                        console.log(`Subject: ${options.subject}`);
                        resolve(true);
                        return;
                    }
                    
                    resolve(false);
                }
            })();
        });
    }

    /* ── Branded, responsive email shell (table-based for email-client safety) ── */

    /**
     * Wraps content in the Velo Courier Services email design: app colors
     * (trust-blue #123C86, action-orange #F2761A), a branded header, a white card,
     * and a muted footer. Responsive to ~520px. No emoji, no em dashes.
     */
    private static renderEmail(heading: string, innerHtml: string, preheader?: string): string {
        const blue = "#123C86", orange = "#F2761A", ink = "#0D1B2E", inkSoft = "#54617A", line = "#E3E9F4", bg = "#F4F6FB";
        const pre = preheader
            ? `<span style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</span>`
            : "";
        const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
        return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${bg};">${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border:1px solid ${line};border-radius:16px;overflow:hidden;font-family:${font};">
      <tr><td style="background:${blue};padding:20px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:12px;height:12px;background:${orange};border-radius:3px;font-size:0;line-height:0">&nbsp;</td>
          <td style="padding-left:10px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-.01em;font-family:${font}">Velo Courier Services</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:32px 28px 6px 28px;">
        <h1 style="margin:0;color:${ink};font-size:22px;font-weight:700;line-height:1.25;font-family:${font}">${heading}</h1>
      </td></tr>
      <tr><td style="padding:14px 28px 32px 28px;color:${ink};font-size:15px;line-height:1.6;font-family:${font}">${innerHtml}</td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid ${line};background:#FBFCFE;color:${inkSoft};font-size:12px;line-height:1.5;font-family:${font}">
        Velo Courier Services Corporation<br>This is an automated message, please do not reply.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
    }

    /* ── Convenience methods ── */

    static async sendOrderConfirmation(to: string, orderId: string, total: string, currency: string): Promise<boolean> {
        const inner = `<p style="margin:0 0 12px 0">Your order <strong>#${orderId}</strong> has been confirmed.</p>
            <p style="margin:0">Total: <strong>${currency} ${total}</strong></p>`;
        return this.send({ to, subject: `Order confirmed - #${orderId}`, html: this.renderEmail("Order confirmed", inner, `Order #${orderId} confirmed`) });
    }

    static async sendDriverAssigned(to: string, driverName: string, estimatedTime: string): Promise<boolean> {
        const inner = `<p style="margin:0 0 12px 0">Your driver <strong>${driverName}</strong> is on the way.</p>
            <p style="margin:0">Estimated arrival: <strong>${estimatedTime}</strong></p>`;
        return this.send({ to, subject: `Driver assigned - ${driverName}`, html: this.renderEmail("Your driver is on the way", inner) });
    }

    static async sendDeliveryComplete(to: string, orderId: string): Promise<boolean> {
        const inner = `<p style="margin:0 0 12px 0">Your order <strong>#${orderId}</strong> has been delivered.</p>
            <p style="margin:0">Thank you for using Velo Courier Services.</p>`;
        return this.send({ to, subject: `Delivery complete - #${orderId}`, html: this.renderEmail("Delivered", inner) });
    }

    static async sendOtp(to: string, code: string): Promise<boolean> {
        const inner = `<p style="margin:0 0 18px 0">Use this code to verify your Velo Courier Services account:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 22px 0">
              <div style="display:inline-block;background:#FDECDD;border:1px solid #F2761A;border-radius:12px;padding:16px 24px;color:#0D1B2E;font-size:34px;font-weight:800;letter-spacing:10px;font-family:'Courier New',monospace">${code}</div>
            </td></tr></table>
            <p style="margin:0 0 8px 0;color:#54617A">This code expires in 10 minutes.</p>
            <p style="margin:0;color:#54617A">If you did not request this, you can safely ignore this email.</p>`;
        return this.send({ to, subject: `Your Velo Courier Services code: ${code}`, html: this.renderEmail("Your verification code", inner, `Your code is ${code}`) });
    }

    static async sendWelcome(to: string, name: string): Promise<boolean> {
        const inner = `<p style="margin:0 0 12px 0">Hi <strong>${name}</strong>,</p>
            <p style="margin:0 0 12px 0">Your account is ready. You can now book rides, order from merchants, and send packages.</p>
            <p style="margin:0;color:#54617A">If you have any questions, contact support any time.</p>`;
        return this.send({ to, subject: `Welcome to Velo Courier Services, ${name}`, html: this.renderEmail("Welcome to Velo Courier Services", inner) });
    }

    /** Check if SMTP is configured */
    static isConfigured(): boolean {
        return !!process.env.SMTP_HOST;
    }
}
