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
    full_name: string;
    email: string;
    location: string;           // Maps to region/state/province
    ghana_card_number?: string; // Optional - required only when country_code === 'GH'
    privacy_consent: boolean;
    role: string;               // Frontend sends 'customer'
    phone: string;
    country_code: string;       // ISO alpha-2 (e.g. 'GH')
}

export interface DriverSetupPayload {
    phone: string;
    full_name: string;
    email: string;
    location: string;
    country_code: string;
    vehicle_type: string;
    vehicle_number: string;
    vehicle_model?: string;
    vehicle_color?: string;
    license_number: string;
    ghana_card_number?: string;
    ghana_card_front_url?: string;
    ghana_card_back_url?: string;
    role: string;
    privacy_consent: boolean;
}

export interface MerchantSetupPayload {
    phone: string;
    business_name: string;
    business_type: string;
    business_address: string;
    business_email: string;
    location: string;
    country_code: string;
    ghana_card_number?: string;
    ghana_card_front_url?: string;
    ghana_card_back_url?: string;
    longitude?: number;
    latitude?: number;
    role: string;
    privacy_consent: boolean;
}
