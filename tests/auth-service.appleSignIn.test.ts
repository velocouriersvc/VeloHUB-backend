/**
 * Unit tests for AuthService Apple Sign-In
 *
 * Two suites:
 *   1. appleSignIn  - exercises user creation, lookup, email-linking, role assignment.
 *      verifyAppleToken is stubbed so no real crypto or network is needed.
 *
 *   2. verifyAppleToken - exercises JWT claim validation and signature verification.
 *      axios.get (Apple JWKS) and crypto.createVerify are mocked so the test is
 *      fully offline.
 *
 * AppDataSource is wired to the manual mock via moduleNameMapper in package.json.
 * Repos that are assigned to service instance properties are replaced via
 * `(svc as any).repo = mockRepo` (same pattern as admin-service tests).
 * Inline AppDataSource.getRepository calls (UserProfile, BuyerProfile) return
 * the stub repo from the mock - findOne returns undefined, which is fine.
 */

// Must be declared before any imports so Jest hoists them.
jest.mock('axios');

// Node's built-in crypto exports are non-configurable, so jest.spyOn cannot
// override them. A jest.mock factory completely replaces the module, including
// non-configurable properties, while still preserving everything else (randomUUID,
// Buffer, etc.) via jest.requireActual.
jest.mock('crypto', () => {
    const actual = jest.requireActual<typeof import('crypto')>('crypto');
    return {
        ...actual,
        createPublicKey: jest.fn(() => ({})),
        createVerify: jest.fn(() => ({
            update: jest.fn().mockReturnThis(),
            verify: jest.fn().mockReturnValue(true),
        })),
    };
});

import { AuthService } from '../src/services/auth-service';
import { RoleStatus } from '../src/models/user-role';
import { RoleType } from '../src/models/role';
import { UserStatus } from '../src/models/user';

const mockedAxios = require('axios') as { get: jest.Mock };
const mockedCrypto = require('crypto') as {
    createPublicKey: jest.Mock;
    createVerify: jest.Mock;
    randomUUID: () => string;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function buildRepo(overrides: Record<string, jest.Mock> = {}) {
    return {
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockImplementation(async (e: any) => e),
        create: jest.fn().mockImplementation((data: any) => ({ ...data })),
        count: jest.fn().mockResolvedValue(0),
        ...overrides,
    };
}

/** Build a minimal base64url-encoded JWT without a real signature. */
function fakeJwt(payload: object, kid = 'test-kid'): string {
    const enc = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    return `${enc({ alg: 'RS256', kid })}.${enc(payload)}.fakesignature`;
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const BUNDLE_ID = 'com.velo.marketplace';
const APPLE_SUB = 'apple.user.subject.001';
const APPLE_EMAIL = 'appleuser@icloud.com';
const APPLE_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.fake.sig'; // placeholder; verifyAppleToken is mocked
const now = Math.floor(Date.now() / 1000);

const validClaimsPayload = {
    iss: 'https://appleid.apple.com',
    aud: BUNDLE_ID,
    exp: now + 3600,
    sub: APPLE_SUB,
    email: APPLE_EMAIL,
};

const buyerRole = { id: 'role-buyer', name: RoleType.BUYER };

const userWithRoles = {
    id: 'user-uuid-existing',
    email: APPLE_EMAIL,
    appleSubjectId: APPLE_SUB,
    phoneNumber: null as null,
    status: UserStatus.ACTIVE,
    activeRole: null as null,
    lastLoginAt: null as null,
    userRoles: [
        { roleId: buyerRole.id, status: RoleStatus.APPROVED, role: buyerRole },
    ],
};

const newUserBase = {
    id: 'user-uuid-new',
    email: APPLE_EMAIL,
    appleSubjectId: APPLE_SUB,
    phoneNumber: null as null,
    status: UserStatus.ACTIVE,
    activeRole: null as null,
    lastLoginAt: null as null,
    userRoles: [] as any[],
};

// ── Suite 1: appleSignIn ──────────────────────────────────────────────────────

describe('AuthService.appleSignIn', () => {
    let svc: AuthService;
    let userRepo: ReturnType<typeof buildRepo>;
    let roleRepo: ReturnType<typeof buildRepo>;
    let userRoleRepo: ReturnType<typeof buildRepo>;

    beforeEach(() => {
        process.env.APPLE_BUNDLE_ID = BUNDLE_ID;

        userRepo = buildRepo();
        roleRepo = buildRepo({ findOne: jest.fn().mockResolvedValue(buyerRole) });
        userRoleRepo = buildRepo();

        svc = new AuthService();

        // Inject repos for the instance-level repositories
        (svc as any).userRepository = userRepo;
        (svc as any).roleRepository = roleRepo;
        (svc as any).userRoleRepository = userRoleRepo;

        // Stub verifyAppleToken so tests never hit Apple's servers
        jest.spyOn(svc as any, 'verifyAppleToken').mockResolvedValue({
            sub: APPLE_SUB,
            email: APPLE_EMAIL,
        });

        // Stub ensureBuyerRoleExists so tests don't need AppDataSource.transaction
        jest.spyOn(svc as any, 'ensureBuyerRoleExists').mockResolvedValue(undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    // ── 1. New-user creation ──────────────────────────────────────────────────

    it('creates a new user when Apple subject ID is not found', async () => {
        // All findOne calls return null → brand-new user
        userRepo.findOne
            .mockResolvedValueOnce(null)   // by appleSubjectId
            .mockResolvedValueOnce(null)   // by email
            .mockResolvedValue({ ...newUserBase, userRoles: [{ role: buyerRole, status: RoleStatus.APPROVED }] });

        await svc.appleSignIn(APPLE_TOKEN, 'Jane Doe', APPLE_EMAIL);

        expect(userRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                appleSubjectId: APPLE_SUB,
                email: APPLE_EMAIL,
                status: UserStatus.ACTIVE,
            })
        );
        expect(userRepo.save).toHaveBeenCalled();
    });

    it('reports is_new_user = true on first sign-in', async () => {
        userRepo.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValue({ ...newUserBase, userRoles: [] });

        const result = await svc.appleSignIn(APPLE_TOKEN, 'Jane Doe', APPLE_EMAIL);

        expect(result.user.is_new_user).toBe(true);
    });

    it('calls ensureBuyerRoleExists for a user with no roles', async () => {
        userRepo.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValue({ ...newUserBase, userRoles: [] });

        await svc.appleSignIn(APPLE_TOKEN, 'Jane Doe', APPLE_EMAIL);

        expect((svc as any).ensureBuyerRoleExists).toHaveBeenCalled();
    });

    // ── 2. Returning user ─────────────────────────────────────────────────────

    it('returns an existing user found by appleSubjectId without creating a new one', async () => {
        userRepo.findOne.mockResolvedValue(userWithRoles);

        const result = await svc.appleSignIn(APPLE_TOKEN);

        expect(userRepo.create).not.toHaveBeenCalled();
        expect(result.user.is_new_user).toBe(false);
        expect(result.user.id).toBe(userWithRoles.id);
    });

    it('reports is_new_user = false for a returning user', async () => {
        userRepo.findOne.mockResolvedValue(userWithRoles);

        const result = await svc.appleSignIn(APPLE_TOKEN);

        expect(result.user.is_new_user).toBe(false);
    });

    it('does not call ensureBuyerRoleExists when user already has roles', async () => {
        userRepo.findOne.mockResolvedValue(userWithRoles);

        await svc.appleSignIn(APPLE_TOKEN);

        expect((svc as any).ensureBuyerRoleExists).not.toHaveBeenCalled();
    });

    it('returns approved roles in the response', async () => {
        userRepo.findOne.mockResolvedValue(userWithRoles);

        const result = await svc.appleSignIn(APPLE_TOKEN);

        expect(result.user.roles).toContain(RoleType.BUYER);
    });

    // ── 3. Email account linking ──────────────────────────────────────────────

    it('links Apple ID to an existing account found by email', async () => {
        const emailOnlyUser = { ...userWithRoles, appleSubjectId: null };

        userRepo.findOne
            .mockResolvedValueOnce(null)         // not found by appleSubjectId
            .mockResolvedValue(emailOnlyUser);   // found by email + subsequent calls

        await svc.appleSignIn(APPLE_TOKEN, undefined, APPLE_EMAIL);

        // The user should be saved with the Apple subject ID linked
        const saveCalls: [any][] = userRepo.save.mock.calls;
        const linkCall = saveCalls.find(([arg]) => arg.appleSubjectId === APPLE_SUB);
        expect(linkCall).toBeDefined();
    });

    it('reports is_new_user = false when linking to an existing email account', async () => {
        const emailOnlyUser = { ...userWithRoles, appleSubjectId: null };
        userRepo.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValue(emailOnlyUser);

        const result = await svc.appleSignIn(APPLE_TOKEN, undefined, APPLE_EMAIL);

        expect(result.user.is_new_user).toBe(false);
    });

    it('skips email lookup when token has no email and none is provided', async () => {
        jest.spyOn(svc as any, 'verifyAppleToken').mockResolvedValue({ sub: APPLE_SUB });

        userRepo.findOne
            .mockResolvedValueOnce(null)  // by appleSubjectId → not found
            // No second findOne for email because resolvedEmail is null
            .mockResolvedValue({ ...newUserBase, userRoles: [] });

        await svc.appleSignIn(APPLE_TOKEN);

        // create should be called only once for the new user
        expect(userRepo.create).toHaveBeenCalledTimes(1);
    });

    // ── 4. lastLoginAt ────────────────────────────────────────────────────────

    it('updates lastLoginAt on every sign-in', async () => {
        userRepo.findOne.mockResolvedValue(userWithRoles);
        userRepo.save.mockImplementation(async (e: any) => e);

        await svc.appleSignIn(APPLE_TOKEN);

        const saveCalls: [any][] = userRepo.save.mock.calls;
        const loginUpdate = saveCalls.find(([arg]) => arg.lastLoginAt instanceof Date);
        expect(loginUpdate).toBeDefined();
    });

    // ── 5. Error propagation ──────────────────────────────────────────────────

    it('propagates errors thrown by verifyAppleToken', async () => {
        jest.spyOn(svc as any, 'verifyAppleToken').mockRejectedValue(
            new Error('Token expired')
        );

        await expect(svc.appleSignIn('bad.token')).rejects.toThrow('Token expired');
    });
});

// ── Suite 2: verifyAppleToken ─────────────────────────────────────────────────

describe('AuthService.verifyAppleToken - claim validation and signature check', () => {
    let svc: AuthService;

    beforeEach(() => {
        process.env.APPLE_BUNDLE_ID = BUNDLE_ID;

        svc = new AuthService();

        // Mock Apple JWKS endpoint - returns a single key matching 'test-kid'
        mockedAxios.get = jest.fn().mockResolvedValue({
            data: {
                keys: [{ kid: 'test-kid', kty: 'RSA', n: 'modulus', e: 'AQAB' }],
            },
        });

        // Reset crypto mocks to passing defaults before each test
        mockedCrypto.createPublicKey.mockReturnValue({});
        mockedCrypto.createVerify.mockReturnValue({
            update: jest.fn().mockReturnThis(),
            verify: jest.fn().mockReturnValue(true),
        });
    });

    afterEach(() => jest.clearAllMocks());

    // ── Claim rejections ──────────────────────────────────────────────────────

    it('throws "Invalid issuer" when iss is not Apple', async () => {
        const token = fakeJwt({ ...validClaimsPayload, iss: 'https://evil.com' });

        await expect((svc as any).verifyAppleToken(token)).rejects.toThrow('Invalid issuer');
    });

    it('throws "Invalid audience" when aud does not match bundle ID', async () => {
        const token = fakeJwt({ ...validClaimsPayload, aud: 'com.other.app' });

        await expect((svc as any).verifyAppleToken(token)).rejects.toThrow('Invalid audience');
    });

    it('throws "Token expired" when exp is in the past', async () => {
        const token = fakeJwt({ ...validClaimsPayload, exp: now - 60 });

        await expect((svc as any).verifyAppleToken(token)).rejects.toThrow('Token expired');
    });

    // ── JWKS key matching ─────────────────────────────────────────────────────

    it('throws when no JWKS key matches the token kid', async () => {
        mockedAxios.get = jest.fn().mockResolvedValue({
            data: { keys: [{ kid: 'different-kid', kty: 'RSA', n: 'n', e: 'AQAB' }] },
        });

        const token = fakeJwt(validClaimsPayload, 'test-kid');

        await expect((svc as any).verifyAppleToken(token)).rejects.toThrow(
            'No matching Apple public key found'
        );
    });

    // ── Signature verification ────────────────────────────────────────────────

    it('throws "Token signature invalid" when crypto verify returns false', async () => {
        mockedCrypto.createVerify.mockReturnValue({
            update: jest.fn().mockReturnThis(),
            verify: jest.fn().mockReturnValue(false),
        });

        const token = fakeJwt(validClaimsPayload);

        await expect((svc as any).verifyAppleToken(token)).rejects.toThrow(
            'Token signature invalid'
        );
    });

    // ── Happy path ────────────────────────────────────────────────────────────

    it('returns { sub, email } for a valid token', async () => {
        const token = fakeJwt(validClaimsPayload);

        const result = await (svc as any).verifyAppleToken(token);

        expect(result).toEqual({ sub: APPLE_SUB, email: APPLE_EMAIL });
    });

    it('returns sub without email when the token carries no email claim', async () => {
        const { email: _drop, ...noEmail } = validClaimsPayload;
        const token = fakeJwt(noEmail);

        const result = await (svc as any).verifyAppleToken(token);

        expect(result.sub).toBe(APPLE_SUB);
        expect(result.email).toBeUndefined();
    });

    it('fetches JWKS from the Apple endpoint', async () => {
        const token = fakeJwt(validClaimsPayload);

        await (svc as any).verifyAppleToken(token);

        expect(mockedAxios.get).toHaveBeenCalledWith(
            'https://appleid.apple.com/auth/keys',
            expect.objectContaining({ timeout: 5000 })
        );
    });
});
