import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

export const validatePhoneNumber = (phoneNumber: string, countryCode?: string): {
  valid: boolean;
  formatted?: string;
  error?: string;
} => {
  try {
    // Most of our records store the number WITHOUT the leading "+" (e.g.
    // 233500647090 instead of +233500647090). Without a country code, libphonenumber
    // needs E.164, so a bare all-digits international number is normalized by
    // re-adding the "+" before parsing. Numbers that are genuinely local or invalid
    // (e.g. +0..., a 9-digit local number) still fail below, so this only rescues real
    // international numbers that merely lost their plus sign.
    let candidate = String(phoneNumber || '').trim();
    if (!countryCode && candidate && !candidate.startsWith('+')) {
      const digits = candidate.replace(/[\s-]/g, '');
      if (/^[0-9]{8,15}$/.test(digits)) {
        candidate = '+' + digits;
      }
    }

    const parsed = parsePhoneNumber(candidate, countryCode as any);

    if (!isValidPhoneNumber(candidate, countryCode as any)) {
      return {
        valid: false,
        error: "Invalid phone number format"
      };
    }

    // Return E.164 format (e.g., +1234567890)
    return {
      valid: true,
      formatted: parsed?.format('E.164')
    };
  } catch (error) {
    return {
      valid: false,
      error: "Phone number parsing failed"
    };
  }
};
