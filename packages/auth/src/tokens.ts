import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { TenantIdSchema, type TenantId } from '@tv/core';

const encoder = (s: string) => new TextEncoder().encode(s);

export const TokenClaimsSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  tid: TenantIdSchema,
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
  plan: z.string(),
  sa: z.boolean().default(false),
  iat: z.number().optional(),
  exp: z.number().optional(),
});
export type TokenClaims = z.infer<typeof TokenClaimsSchema>;

export interface IssueTokenInput {
  sub: string;
  email: string;
  tid: TenantId;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  plan: string;
  sa?: boolean;
}

export const issueAccessToken = async (
  input: IssueTokenInput,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 7,
): Promise<string> => {
  const key = encoder(secret);
  return new SignJWT({
    email: input.email,
    tid: input.tid,
    role: input.role,
    plan: input.plan,
    sa: input.sa ?? false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
};

export const verifyAccessToken = async (token: string, secret: string): Promise<TokenClaims> => {
  const key = encoder(secret);
  const { payload } = await jwtVerify(token, key);
  return TokenClaimsSchema.parse(payload);
};
