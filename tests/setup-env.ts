/**
 * Jest setup - runs before any test module is imported.
 *
 * Several services instantiate third-party SDK clients in their constructors
 * (Prelude, Paystack, etc.) which throw when their env vars are missing. Tests
 * don't hit the network, so we provide dummy values to satisfy construction.
 */
process.env.API_TOKEN = process.env.API_TOKEN || "test-prelude-token";
process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "sk_test_dummy";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "test-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
