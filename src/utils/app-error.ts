/**
 * AppError - typed application error carrying an HTTP status code and a
 * machine-readable code so controllers can return meaningful responses
 * instead of opaque 500s.
 *
 * Services should throw `AppError` (or one of the factory helpers) for any
 * *expected* business condition (validation, not-found, conflict, payment).
 * Anything else that bubbles up is treated as an unexpected 500.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details?: Record<string, unknown>;

    constructor(
        statusCode: number,
        message: string,
        code = "APP_ERROR",
        details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        // Restore prototype chain (needed when targeting ES5/ES2015 with TS)
        Object.setPrototypeOf(this, AppError.prototype);
    }

    static badRequest(message: string, code = "BAD_REQUEST", details?: Record<string, unknown>) {
        return new AppError(400, message, code, details);
    }

    static unauthorized(message = "Authentication required", code = "UNAUTHORIZED") {
        return new AppError(401, message, code);
    }

    static forbidden(message = "Forbidden", code = "FORBIDDEN") {
        return new AppError(403, message, code);
    }

    static notFound(message: string, code = "NOT_FOUND") {
        return new AppError(404, message, code);
    }

    static conflict(message: string, code = "CONFLICT", details?: Record<string, unknown>) {
        return new AppError(409, message, code, details);
    }

    static paymentRequired(message: string, code = "PAYMENT_FAILED") {
        return new AppError(402, message, code);
    }
}

export interface MappedError {
    status: number;
    body: Record<string, unknown>;
}

/**
 * Map any thrown value into a clean HTTP response.
 *
 * Resolution order:
 *  1. `AppError`              → use its statusCode / message / code / details
 *  2. `{ "type": "BELOW_MOV" }` JSON-string errors → 400 with MOV details
 *  3. Legacy string-convention errors (back-compat with existing services)
 *  4. Anything else          → 500 "Internal server error"
 *
 * This keeps the platform working while services are migrated to AppError,
 * and guarantees that known business errors never surface as a generic 500.
 */
export function mapErrorToResponse(error: unknown): MappedError {
    // 1. Typed AppError
    if (error instanceof AppError) {
        return {
            status: error.statusCode,
            body: {
                success: false,
                code: error.code,
                message: error.message,
                ...(error.details ?? {}),
            },
        };
    }

    const message = error instanceof Error ? error.message : String(error);

    // 2. Structured BELOW_MOV error (JSON string)
    if (message.startsWith("{")) {
        try {
            const parsed = JSON.parse(message);
            if (parsed?.type === "BELOW_MOV") {
                return {
                    status: 400,
                    body: {
                        success: false,
                        code: "BELOW_MOV",
                        message: parsed.message,
                        minimumOrderValue: parsed.minimumOrderValue,
                        currentSubtotal: parsed.currentSubtotal,
                        remainingAmount: parsed.remainingAmount,
                    },
                };
            }
        } catch {
            // not JSON - fall through to string matching
        }
    }

    // 3. Legacy string conventions used across existing services
    const lower = message.toLowerCase();

    if (lower.includes("out of stock")) {
        return { status: 409, body: { success: false, code: "OUT_OF_STOCK", message } };
    }
    if (lower.includes("payment failed")) {
        return { status: 402, body: { success: false, code: "PAYMENT_FAILED", message } };
    }
    if (
        lower.includes("empty") ||
        lower.includes("no merchant") ||
        lower.includes("required") ||
        lower.includes("not set") ||
        lower.includes("invalid")
    ) {
        return { status: 400, body: { success: false, code: "BAD_REQUEST", message } };
    }
    if (lower.includes("not found")) {
        return { status: 404, body: { success: false, code: "NOT_FOUND", message } };
    }

    // 4. Unexpected - opaque 500
    return {
        status: 500,
        body: { success: false, code: "INTERNAL_ERROR", message: "Internal server error" },
    };
}
