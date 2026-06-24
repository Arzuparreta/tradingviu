import { z } from 'zod';

const optionalDatetimeEnv = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().datetime().optional(),
);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DOMAIN: z.string().default('localhost'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  DATABASE_URL: z.string().url(),
  DATABASE_URL_ADMIN: z.string().url().optional(),
  REDIS_URL: z.string().url(),
  CORS_ORIGIN: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(3001),
  MEILI_HOST: z.string().url().optional(),
  MEILI_MASTER_KEY: z.string().optional(),
  NEWS_PROVIDER: z.enum(['mock']).default('mock'),
  NEWS_INGEST_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
  NEWS_INGEST_SYMBOLS: z.string().optional(),
  NEWS_INGEST_FROM: optionalDatetimeEnv,
  NEWS_INGEST_TO: optionalDatetimeEnv,
  NEWS_INGEST_LIMIT: z.coerce.number().int().positive().max(500).default(100),
  FUNDAMENTALS_PROVIDER: z.enum(['mock', 'polygon']).default('mock'),
  FUNDAMENTALS_INGEST_INTERVAL_SECONDS: z.coerce.number().int().positive().default(900),
  FUNDAMENTALS_INGEST_SYMBOLS: z.string().optional(),
  FUNDAMENTALS_INGEST_LIMIT: z.coerce.number().int().positive().max(200).default(50),
  POLYGON_KEY: z.string().optional(),
  MACRO_PROVIDER: z.enum(['mock', 'fred']).default('mock'),
  MACRO_INGEST_INTERVAL_SECONDS: z.coerce.number().int().positive().default(900),
  MACRO_INGEST_COUNTRY: z.string().default('US'),
  MACRO_INGEST_FROM: optionalDatetimeEnv,
  MACRO_INGEST_TO: optionalDatetimeEnv,
  MACRO_INGEST_LIMIT: z.coerce.number().int().positive().max(500).default(100),
  FRED_KEY: z.string().optional(),
  CALENDAR_PROVIDER: z.enum(['mock', 'fmp']).default('mock'),
  CALENDAR_INGEST_INTERVAL_SECONDS: z.coerce.number().int().positive().default(900),
  CALENDAR_INGEST_SYMBOLS: z.string().optional(),
  CALENDAR_INGEST_COUNTRY: z.string().optional(),
  CALENDAR_INGEST_FROM: optionalDatetimeEnv,
  CALENDAR_INGEST_TO: optionalDatetimeEnv,
  CALENDAR_INGEST_LIMIT: z.coerce.number().int().positive().max(1000).default(250),
  FMP_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  POSTMARK_TOKEN: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  CRED_ENC_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'CRED_ENC_KEY must be 64 hex chars (32 bytes)'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
};

export const requireEnv = <K extends keyof Env>(key: K): NonNullable<Env[K]> => {
  const v = loadEnv()[key];
  if (v === undefined || v === null || v === '') {
    throw new Error(`Required env var missing: ${String(key)}`);
  }
  return v as NonNullable<Env[K]>;
};
