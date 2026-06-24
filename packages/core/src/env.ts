import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DOMAIN: z.string().default('localhost'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  DATABASE_URL: z.string().url(),
  DATABASE_URL_ADMIN: z.string().url().optional(),
  REDIS_URL: z.string().url(),
  CORS_ORIGIN: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(3001),
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
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
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
