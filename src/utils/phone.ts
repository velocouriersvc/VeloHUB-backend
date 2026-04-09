
/**
 * Maps international phone prefixes to ISO country codes.
 */
export const prefixToCountry: Record<string, string> = {
    "233": "GH", // Ghana
    "234": "NG", // Nigeria
    "254": "KE", // Kenya
    "256": "UG", // Uganda
    "250": "RW", // Rwanda
    "255": "TZ", // Tanzania
    "27": "ZA",  // South Africa
    "20": "EG",  // Egypt
    "251": "ET", // Ethiopia
    "212": "MA", // Morocco
    "225": "CI", // Ivory Coast
    "221": "SN", // Senegal
    "237": "CM", // Cameroon
    "1": "US",   // USA/Canada (Simplifying to US for now as primary market)
    "44": "GB",  // UK
    "971": "AE", // UAE
};

/**
 * Infers country code from a phone number string.
 * Handles formats like +233..., 233..., 0...
 */
export function inferCountryFromPhone(phone: string): string | null {
    if (!phone) return null;

    // Remove all non-numeric characters
    const clean = phone.replace(/\D/g, "");

    // If it starts with 0 and is likely a local Ghana number (10 digits)
    if (clean.startsWith("0") && clean.length === 10) {
        return "GH";
    }

    // Check long prefixes first
    const prefixes = Object.keys(prefixToCountry).sort((a, b) => b.length - a.length);

    for (const prefix of prefixes) {
        if (clean.startsWith(prefix)) {
            return prefixToCountry[prefix];
        }
    }

    return null;
}
