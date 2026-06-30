import { DataSource } from "typeorm";
import dotenv from "dotenv";

dotenv.config();

/**
 * SSL is required when connecting to Supabase (and most managed Postgres hosts).
 * Enable with DB_SSL=true. Self-hosted Contabo without SSL → leave it unset.
 */
const useSsl = process.env.DB_SSL === "true";
const sslOption: boolean | { rejectUnauthorized: boolean } = useSsl
  ? { rejectUnauthorized: false }
  : false;

/**
 * `synchronize` auto-alters the schema from entities on every boot. It's
 * convenient in dev but risky in production - after the schema has been
 * restored/migrated to Supabase, set DB_SYNCHRONIZE=false to freeze it.
 * Defaults to "true" to preserve the previous behaviour.
 */
const synchronize = (process.env.DB_SYNCHRONIZE ?? "true") === "true";

/**
 * Cap the connection pool. Supabase enforces per-plan connection limits, and
 * with multiple API replicas an unbounded pool will exhaust them. Tune via
 * DB_POOL_MAX (default 10 per replica).
 */
const poolMax = parseInt(process.env.DB_POOL_MAX || "10");

const commonOptions = {
  type: "postgres" as const,
  synchronize,
  logging: process.env.NODE_ENV === "development",
  entities: [__dirname + "/../models/**/*.{ts,js}"],
  migrations: [__dirname + "/../migrations/**/*.{ts,js}"],
  subscribers: [__dirname + "/subscribers/**/*.{ts,js}"],
  ssl: sslOption,
  extra: {
    max: poolMax,
  },
};

/**
 * Two ways to configure the connection:
 *  1. DATABASE_URL - a full Postgres connection string (Supabase gives you one).
 *  2. Discrete DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_NAME vars.
 * DATABASE_URL takes precedence when present.
 */
export const AppDataSource = new DataSource(
  process.env.DATABASE_URL
    ? { ...commonOptions, url: process.env.DATABASE_URL }
    : {
        ...commonOptions,
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "5432"),
        username: process.env.DB_USERNAME || "postgres",
        password: process.env.DB_PASSWORD || "postgres",
        database: process.env.DB_NAME || "velo",
      }
);
