import crypto from "crypto";

/**
 * Password hashing using Node's built-in scrypt (no external dependency).
 * Stored format: "<saltHex>:<derivedHex>". Comparison is timing-safe.
 */
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");
    return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
    if (!stored || !stored.includes(":")) return false;
    const [salt, key] = stored.split(":");
    if (!salt || !key) return false;
    const derived = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");
    const keyBuf = Buffer.from(key, "hex");
    const derivedBuf = Buffer.from(derived, "hex");
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
}
