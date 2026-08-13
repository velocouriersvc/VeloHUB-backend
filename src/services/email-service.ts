import * as net from 'net';
import * as tls from 'tls';

/* ---------------------------------------------
 *  EmailService - lightweight SMTP client
 *
 *  Sends email via an authenticated SMTP relay (Spacemail, Gmail, etc.) or a
 *  local Postfix (port 25, no auth). Zero external dependencies - raw sockets.
 *
 *  Resilient delivery: send() tries the PRIMARY relay first and, if that fails,
 *  falls back to a SECOND relay (FALLBACK_SMTP_*, e.g. Microsoft 365 on 587
 *  STARTTLS). Either success returns true.
 *
 *  Primary env vars (injected from ConfigMap / Secret):
 *    SMTP_HOST       host, e.g. mail.spacemail.com
 *    SMTP_PORT       port, e.g. 465
 *    SMTP_FROM       from address, e.g. noreply@velocouriersvc.com
 *    SMTP_FROM_NAME  display name, e.g. Velo Courier Services
 *    SMTP_AUTH       "true" to enable LOGIN auth
 *    SMTP_USER       username (only when AUTH is true)
 *    SMTP_PASSWORD   password (only when AUTH is true)
 *    SMTP_SECURE     "true" for implicit TLS (port 465)
 *    SMTP_STARTTLS   "true" to upgrade a plaintext connection to TLS (port 587)
 *
 *  Fallback env vars: same keys prefixed FALLBACK_SMTP_* (defaults suit
 *  Microsoft 365: smtp.office365.com:587, STARTTLS + AUTH). The fallback is
 *  used only when both a host and a password are configured.
 * --------------------------------------------- */

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
    starttls: boolean;
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
        starttls: process.env.SMTP_STARTTLS === 'true',
    };
}

/**
 * Backup relay used when the primary send fails. Defaults suit Microsoft 365
 * (smtp.office365.com:587, STARTTLS + AUTH LOGIN). Returns null unless both a
 * host and a password are configured, so an unconfigured fallback stays dormant.
 */
function getFallbackConfig(): SmtpConfig | null {
    const host = process.env.FALLBACK_SMTP_HOST || '';
    const password = process.env.FALLBACK_SMTP_PASSWORD || '';
    if (!host || !password) return null;
    const user = process.env.FALLBACK_SMTP_USER || '';
    return {
        host,
        port: parseInt(process.env.FALLBACK_SMTP_PORT || '587', 10),
        from: process.env.FALLBACK_SMTP_FROM || user,
        fromName: process.env.FALLBACK_SMTP_FROM_NAME || 'Velo Courier Services',
        auth: process.env.FALLBACK_SMTP_AUTH !== 'false',
        user,
        password,
        secure: process.env.FALLBACK_SMTP_SECURE === 'true',
        starttls: process.env.FALLBACK_SMTP_STARTTLS !== 'false',
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

/** Upgrade a plaintext SMTP socket to TLS after a STARTTLS command (port 587). */
function upgradeToTls(socket: net.Socket, host: string): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
        const secure = tls.connect({ socket, servername: host }, () => resolve(secure));
        secure.once('error', reject);
    });
}

export class EmailService {
    /* ── Public API ── */

    static async send(options: EmailOptions): Promise<boolean> {
        const primary = getConfig();

        if (!primary.host) {
            if (process.env.NODE_ENV === 'development') {
                console.log('--------------------------------------------------');
                console.log('📧 [EmailService] DEVELOPMENT MODE - SIMULATING SEND');
                console.log(`To: ${options.to}`);
                console.log(`Subject: ${options.subject}`);
                if (options.attachments?.length) {
                    console.log(`Attachments: ${options.attachments.map(a => a.filename).join(', ')}`);
                }
                console.log('--------------------------------------------------');
                return true;
            }
            console.warn('[EmailService] SMTP_HOST not set - skipping email');
            return false;
        }

        // Try the primary relay; if it fails, fall back to the backup relay (when configured).
        if (await this.sendVia(primary, options)) return true;

        const fallback = getFallbackConfig();
        if (fallback) {
            console.warn('[EmailService] primary relay failed, trying fallback relay');
            if (await this.sendVia(fallback, options)) return true;
        }

        if (process.env.NODE_ENV === 'development') {
            console.log('📧 [EmailService] FALLBACK TO SIMULATION (Real SMTP failed)');
            console.log(`To: ${options.to} | Subject: ${options.subject}`);
            return true;
        }
        return false;
    }

    /* Deliver one message through a single relay. Resolves false on any failure. */
    private static sendVia(cfg: SmtpConfig, options: EmailOptions): Promise<boolean> {
        const recipients = Array.isArray(options.to) ? options.to : [options.to];
        const message = this.buildMessage(cfg, recipients, options);

        return new Promise((resolve) => {
            let socket: net.Socket = cfg.secure
                ? tls.connect({ port: cfg.port, host: cfg.host })
                : net.createConnection({ port: cfg.port, host: cfg.host });

            let settled = false;
            const done = (ok: boolean) => {
                if (settled) return;
                settled = true;
                resolve(ok);
            };

            const attach = (s: net.Socket) => {
                s.setTimeout(15_000);
                s.on('timeout', () => {
                    console.error(`[EmailService] ${cfg.host} connection timed out`);
                    s.destroy();
                    done(false);
                });
                s.on('error', (err) => {
                    console.error(`[EmailService] ${cfg.host} socket error:`, err.message);
                    done(false);
                });
            };
            attach(socket);

            (async () => {
                try {
                    await waitForGreeting(socket);
                    await smtpCommand(socket, `EHLO velo-api`, '250');

                    // STARTTLS: upgrade the plaintext connection to TLS, then greet again (port 587).
                    if (cfg.starttls) {
                        await smtpCommand(socket, 'STARTTLS', '220');
                        socket = await upgradeToTls(socket, cfg.host);
                        attach(socket);
                        await smtpCommand(socket, `EHLO velo-api`, '250');
                    }

                    if (cfg.auth && cfg.user && cfg.password) {
                        await smtpCommand(socket, 'AUTH LOGIN', '334');
                        await smtpCommand(socket, Buffer.from(cfg.user).toString('base64'), '334');
                        await smtpCommand(socket, Buffer.from(cfg.password).toString('base64'), '235');
                    }

                    await smtpCommand(socket, `MAIL FROM:<${cfg.from}>`, '250');
                    for (const rcpt of recipients) {
                        await smtpCommand(socket, `RCPT TO:<${rcpt}>`, '250');
                    }
                    await smtpCommand(socket, 'DATA', '354');
                    await smtpCommand(socket, `${message}\r\n.`, '250');
                    await smtpCommand(socket, 'QUIT', '221');

                    socket.end();
                    console.log(`[EmailService] sent to ${recipients.join(', ')} via ${cfg.host}`);
                    done(true);
                } catch (err: any) {
                    console.error(`[EmailService] ${cfg.host} conversation failed:`, err.message);
                    socket.destroy();
                    done(false);
                }
            })();
        });
    }

    /* Build the RFC822 message (headers + body/attachments) for a given relay. */
    private static buildMessage(cfg: SmtpConfig, recipients: string[], options: EmailOptions): string {
        const body = options.html || options.text || '';
        const isHtml = !!options.html;
        const hasAttachments = !!(options.attachments && options.attachments.length > 0);

        const lines: string[] = [
            `From: ${cfg.fromName} <${cfg.from}>`,
            `To: ${recipients.join(', ')}`,
            `Subject: ${options.subject}`,
            `MIME-Version: 1.0`,
            `Date: ${new Date().toUTCString()}`,
        ];

        if (hasAttachments) {
            const boundary = `----=_Part_${Math.random().toString(36).substring(2)}`;
            lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, ``);
            lines.push(`--${boundary}`);
            lines.push(`Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=UTF-8`);
            lines.push(`Content-Transfer-Encoding: 7bit`, ``);
            lines.push(body);
            for (const att of options.attachments!) {
                lines.push(`--${boundary}`);
                lines.push(`Content-Type: ${att.contentType}; name="${att.filename}"`);
                lines.push(`Content-Transfer-Encoding: base64`);
                lines.push(`Content-Disposition: attachment; filename="${att.filename}"`, ``);
                lines.push(att.content);
            }
            lines.push(`--${boundary}--`);
        } else {
            lines.push(`Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=UTF-8`, ``);
            lines.push(body);
        }

        return lines.join('\r\n');
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
