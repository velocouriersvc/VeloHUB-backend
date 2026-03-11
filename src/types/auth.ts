import { Request } from "express";
import { RoleType } from "../models/role";

export interface RequestOtpPayload {
    phoneNumber: string;
}

export interface VerifyOtpPayload {
    phoneNumber: string;
    code: string;
}

export interface AuthUserResponse {
    id: string;
    is_new_user: boolean;
    roles: RoleType[];
}

export interface AuthResponse {
    token: string;
    user: AuthUserResponse;
}

export interface SupabaseUser {
    id: string;
    email?: string;
    phone?: string;
    [key: string]: unknown;
}

export interface AuthenticatedRequest extends Request {
    user: SupabaseUser;
}

export interface SyncUserResponse {
    user: {
        id: string;
        email?: string;
        phoneNumber?: string;
        status: string;
        roles: RoleType[];
    };
    isNewUser: boolean;
}
