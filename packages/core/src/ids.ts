import { z } from 'zod';

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

const ULIDLike = z
  .string()
  .regex(ULID_REGEX, 'invalid ULID')
  .describe('26-char Crockford ULID');

export const UserIdSchema = ULIDLike.brand<'UserId'>();
export type UserId = z.infer<typeof UserIdSchema>;

export const SymbolIdSchema = ULIDLike.brand<'SymbolId'>();
export type SymbolId = z.infer<typeof SymbolIdSchema>;

export const IdempotencyKeySchema = z.string().min(8).max(128);

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const ulid = (): string => {
  const now = Date.now();
  let time = '';
  let t = now;
  for (let i = 9; i >= 0; i--) {
    const mod = t % 32;
    time = ALPHABET[mod] + time;
    t = Math.floor(t / 32);
  }
  let rand = '';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 16; i++) {
    rand += ALPHABET[bytes[i]! % 32];
  }
  return time + rand;
};

export const newUserId = (): UserId => UserIdSchema.parse(ulid());
export const newSymbolId = (): SymbolId => SymbolIdSchema.parse(ulid());

const slugRe = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const SlugSchema = z.string().regex(slugRe, 'invalid slug');
export type Slug = z.infer<typeof SlugSchema>;
