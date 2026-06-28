import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

const encoder = (s: string) => new TextEncoder().encode(s);

export const TokenClaimsSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});
export type TokenClaims = z.infer<typeof TokenClaimsSchema>;

export interface IssueTokenInput {
  sub: string;
  email: string;
}

export const issueAccessToken = async (
  input: IssueTokenInput,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 7,
): Promise<string> => {
  const key = encoder(secret);
  return new SignJWT({ email: input.email })
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
