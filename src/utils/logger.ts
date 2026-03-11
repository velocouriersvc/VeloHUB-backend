import winston from "winston";

// ─── Sensitive Data Patterns ────────────────────────────────────────

interface SensitivePattern {
  regex: RegExp;
  replacement: string | ((match: string) => string);
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // OTP codes (4-8 digit sequences after known labels)
  { regex: /\b(otp|code|verification|pin)[:\s=]*\d{4,8}\b/gi, replacement: "$1: [REDACTED]" },
  // Phone numbers (Ghana format +233... or 0...)
  { regex: /(\+233|0)\d{2}\d{3}\d{4}/g, replacement: (match: string) => maskPhone(match) },
  // API keys
  { regex: /(api[_-]?key|authorization|bearer|token)[:\s=]*[A-Za-z0-9_\-.]{8,}/gi, replacement: "$1: [REDACTED]" },
  // Email addresses
  { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "[EMAIL_REDACTED]" },
  // Paystack secret keys
  { regex: /sk_(test|live)_[a-zA-Z0-9]+/g, replacement: "sk_***[REDACTED]" },
  // Password fields
  { regex: /(password|secret|passwd)[:\s=]*\S+/gi, replacement: "$1: [REDACTED]" },
];

function maskPhone(phone: string): string {
  if (phone.startsWith("+233")) {
    return `+233***${phone.slice(-4)}`;
  }
  return `${phone.slice(0, 3)}***${phone.slice(-4)}`;
}

function sanitize(message: string): string {
  let sanitized = message;
  for (const { regex, replacement } of SENSITIVE_PATTERNS) {
    if (typeof replacement === "function") {
      sanitized = sanitized.replace(regex, replacement as any);
    } else {
      sanitized = sanitized.replace(regex, replacement);
    }
  }
  return sanitized;
}

// ─── Custom Format ──────────────────────────────────────────────────

const sanitizeFormat = winston.format((info) => {
  if (typeof info.message === "string") {
    info.message = sanitize(info.message);
  }
  return info;
});

const isProduction = process.env.NODE_ENV === "production";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  defaultMeta: { service: "velo-api" },
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    winston.format.errors({ stack: true }),
    sanitizeFormat()
  ),
  transports: [
    new winston.transports.Console({
      format: isProduction
        ? winston.format.combine(winston.format.json())
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, service, context, ...rest }) => {
              const ctx = context ? ` [${context}]` : "";
              const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
              return `${timestamp} ${level}${ctx}: ${message}${extra}`;
            })
          ),
    }),
  ],
});

// ─── Service Logger Factory ─────────────────────────────────────────

/**
 * Create a child logger for a specific service/module.
 *
 * Usage:
 * ```
 * const log = createServiceLogger("RideService");
 * log.info("Ride created", { rideId: "abc-123" });
 * log.error("Failed to process ride", { error: err.message });
 * ```
 */
export function createServiceLogger(context: string) {
  return logger.child({ context });
}

export default logger;
