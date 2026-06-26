/**
 * Mock for src/utils/supabase-client.ts
 *
 * The real module calls `createClient` from the ESM-only `@supabase/supabase-js`
 * at import time (and needs env vars). Services import { supabase, supabaseAdmin }
 * at module load, so this stub provides chainable no-op clients for jest.
 */
const queryStub: any = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
};

const clientStub: any = {
    from: jest.fn(() => queryStub),
    auth: {
        admin: {
            createUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
            deleteUser: jest.fn().mockResolvedValue({ data: null, error: null }),
            listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
        },
        signInWithPassword: jest.fn().mockResolvedValue({ data: null, error: null }),
        getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
};

export const supabase = clientStub;
export const supabaseAdmin = clientStub;
