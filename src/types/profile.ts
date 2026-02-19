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
    last_location: any | null; // geography is complex, using any for now
    referral_code: string | null;
    referral_credits: number;
    referred_by: string | null;
    total_referrals: number;
}
