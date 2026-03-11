export type UserType = 'buyer' | 'driver' | 'merchant';

export interface Profile {
    id: string; // uuid
    id_card_id: string | null; // uuid
    phone_number: string;
    full_name: string;
    country: string | null;
    region: string | null;
    city: string | null;
    email: string | null;
    avatar_url: string | null;
    is_active: boolean;
    otp_verified: boolean;
    phone_verified_at: string | null; // timestamp with time zone as string
    created_at: string;
    updated_at: string;
    user_type: UserType;
    last_location: { lat: number; lng: number } | null;
    referral_code: string | null;
    referral_credits: number;
    referred_by: string | null;
    total_referrals: number;
}

export interface BuyerSetupPayload {
    fullName: string;
    email?: string;
    region?: string;
    primaryLocation?: string;
}

export interface DriverSetupPayload {
    fullName: string;
    idNumber: string; // Ghana Card Number
    vehicleType: string;
    plateNumber: string;
    licenseNumber: string;
    licensePhotoUrl: string; // URL from upload service
    idImageUrl: string; // URL for Ghana Card Front/Back
}

export interface MerchantSetupPayload {
    businessName: string;
    category: string;
    businessEmail?: string;
    businessPhone?: string;
    address: string;
    latitude?: number;
    longitude?: number;
    registrationDocUrl?: string; // URL from upload service
    idNumber: string; // Ghana Card Number
    idImageUrl: string;
}
