import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

export const validatePhoneNumber = (phoneNumber: string, countryCode?: string): {
  valid: boolean;
  formatted?: string;
  error?: string;
} => {
  try {
    // Parse with country code if provided, otherwise assume E.164 format
    const parsed = parsePhoneNumber(phoneNumber, countryCode as any);
    
    if (!isValidPhoneNumber(phoneNumber, countryCode as any)) {
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
