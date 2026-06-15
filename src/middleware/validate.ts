/**
 * Request Validation Middleware
 *
 * Provides Express middleware for validating req.body, req.query and req.params
 * at the route level before the request reaches a controller.
 *
 * Usage:
 *   import { validate, body, query, param } from "../middleware/validate";
 *
 *   router.post("/orders/checkout", validate([
 *     body("deliveryType").required(),
 *     body("paymentMethod").required().isIn(["MOMO", "CARD", "CASH", "WALLET"]),
 *     body("deliveryLat").optional().isNumber(),
 *   ]), controller.checkout);
 */
import { Request, Response, NextFunction } from "express";

// ── Types ────────────────────────────────────────────────────────

type Source = "body" | "query" | "params";

interface ValidationError {
    field: string;
    message: string;
}

interface FieldRule {
    field: string;
    source: Source;
    rules: RuleCheck[];
}

interface RuleCheck {
    check: (value: unknown) => boolean;
    message: string;
}

// ── Rule Builder ─────────────────────────────────────────────────

class RuleBuilder {
    private _field: string;
    private _source: Source;
    private _rules: RuleCheck[] = [];
    private _isOptional = false;

    constructor(field: string, source: Source) {
        this._field = field;
        this._source = source;
    }

    /** Field must be present and not undefined/null/empty-string */
    required(msg?: string): this {
        this._rules.push({
            check: (v) => v !== undefined && v !== null && v !== "",
            message: msg || `${this._field} is required`,
        });
        return this;
    }

    /** Field is optional - skip subsequent checks if absent */
    optional(): this {
        this._isOptional = true;
        return this;
    }

    /** Value must be a string */
    isString(msg?: string): this {
        this._rules.push({
            check: (v) => typeof v === "string",
            message: msg || `${this._field} must be a string`,
        });
        return this;
    }

    /** Value must be numeric (or castable to number) */
    isNumber(msg?: string): this {
        this._rules.push({
            check: (v) => !isNaN(Number(v)),
            message: msg || `${this._field} must be a number`,
        });
        return this;
    }

    /** Value must be a positive number */
    isPositive(msg?: string): this {
        this._rules.push({
            check: (v) => Number(v) > 0,
            message: msg || `${this._field} must be a positive number`,
        });
        return this;
    }

    /** Value must be an integer */
    isInt(msg?: string): this {
        this._rules.push({
            check: (v) => Number.isInteger(Number(v)),
            message: msg || `${this._field} must be an integer`,
        });
        return this;
    }

    /** Value must be a boolean */
    isBoolean(msg?: string): this {
        this._rules.push({
            check: (v) => typeof v === "boolean" || v === "true" || v === "false",
            message: msg || `${this._field} must be a boolean`,
        });
        return this;
    }

    /** Value must be a valid UUID */
    isUUID(msg?: string): this {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        this._rules.push({
            check: (v) => typeof v === "string" && uuidRegex.test(v),
            message: msg || `${this._field} must be a valid UUID`,
        });
        return this;
    }

    /** Value must be one of the given values */
    isIn(values: readonly (string | number)[], msg?: string): this {
        this._rules.push({
            check: (v) => values.includes(v as string | number),
            message: msg || `${this._field} must be one of: ${values.join(", ")}`,
        });
        return this;
    }

    /** Value must be an array */
    isArray(msg?: string): this {
        this._rules.push({
            check: (v) => Array.isArray(v),
            message: msg || `${this._field} must be an array`,
        });
        return this;
    }

    /** String minimum length */
    minLength(len: number, msg?: string): this {
        this._rules.push({
            check: (v) => typeof v === "string" && v.length >= len,
            message: msg || `${this._field} must be at least ${len} characters`,
        });
        return this;
    }

    /** Numeric minimum value */
    min(n: number, msg?: string): this {
        this._rules.push({
            check: (v) => Number(v) >= n,
            message: msg || `${this._field} must be at least ${n}`,
        });
        return this;
    }

    /** Numeric maximum value */
    max(n: number, msg?: string): this {
        this._rules.push({
            check: (v) => Number(v) <= n,
            message: msg || `${this._field} must be at most ${n}`,
        });
        return this;
    }

    /** Custom validation function */
    custom(fn: (value: unknown) => boolean, msg: string): this {
        this._rules.push({ check: fn, message: msg });
        return this;
    }

    /** @internal - build the final rule set */
    _build(): FieldRule & { isOptional: boolean } {
        return {
            field: this._field,
            source: this._source,
            rules: this._rules,
            isOptional: this._isOptional,
        };
    }
}

// ── Factory helpers ──────────────────────────────────────────────

export const body = (field: string) => new RuleBuilder(field, "body");
export const query = (field: string) => new RuleBuilder(field, "query");
export const param = (field: string) => new RuleBuilder(field, "params");

// ── Middleware ────────────────────────────────────────────────────

/**
 * Express middleware that validates request data.
 *
 * Returns 400 with `{ errors: [...] }` if validation fails.
 */
export const validate = (builders: RuleBuilder[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const errors: ValidationError[] = [];

        for (const builder of builders) {
            const rule = builder._build();
            const source = req[rule.source] as Record<string, unknown>;
            const value = source?.[rule.field];

            // Skip optional fields when absent
            if (rule.isOptional && (value === undefined || value === null)) {
                continue;
            }

            for (const r of rule.rules) {
                if (!r.check(value)) {
                    errors.push({ field: rule.field, message: r.message });
                    break; // One error per field
                }
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }

        next();
    };
};
