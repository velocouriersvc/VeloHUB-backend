import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

// App markets, tried in order for national-format numbers that carry no country
// code (e.g. a Ghana "0536690447"). Ghana first since it is the primary market.
const DEFAULT_REGIONS = ['GH', 'NG', 'US'] as const;

export const validatePhoneNumber = (phoneNumber: string, countryCode?: string): {
  valid: boolean;
  formatted?: string;
  error?: string;
} => {
  const raw = String(phoneNumber || '').trim();
  if (!raw) {
    return { valid: false, error: "Invalid phone number format" };
  }

  // Build an ordered list of [candidate, region] attempts. The first that parses
  // to a valid number wins and is returned as E.164. Records store numbers in
  // several shapes (E.164 "+233...", no plus "233...", or national "0536...");
  // this normalizes all of them without ever throwing out early.
  const digits = raw.replace(/[\s-]/g, '');
  const attempts: Array<[string, string | undefined]> = [];

  if (raw.startsWith('+')) {
    attempts.push([raw, countryCode]);
  } else if (/^[0-9]{8,15}$/.test(digits) && !digits.startsWith('0')) {
    // Bare international number that merely lost its "+" (e.g. 233500647090).
    attempts.push(['+' + digits, countryCode]);
  }
  if (countryCode) {
    attempts.push([raw, countryCode]);
  }
  // National-format fallback (leading 0 or otherwise): try the app's markets.
  for (const region of DEFAULT_REGIONS) {
    attempts.push([raw, region]);
  }

  for (const [candidate, region] of attempts) {
    try {
      if (isValidPhoneNumber(candidate, region as any)) {
        return { valid: true, formatted: parsePhoneNumber(candidate, region as any)?.format('E.164') };
      }
    } catch {
      // Not parseable with this region; try the next candidate.
    }
  }

  return { valid: false, error: "Invalid phone number format" };
};
