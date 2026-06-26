import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Personal access tokens for the public API. The full key is shown to the user
 * once at creation; only its SHA-256 hash and a lookup `prefix` are stored. Keys
 * are high-entropy random strings, so a fast hash (not a password KDF) is the
 * right choice — lookup is by `prefix`, then a constant-time hash comparison.
 *
 * Format: `tvk_<prefix>_<secret>` (all lowercase hex).
 */
const PREFIX_BYTES = 6; // 12 hex chars
const SECRET_BYTES = 24; // 48 hex chars
const KEY_RE = /^tvk_([0-9a-f]{2,32})_([0-9a-f]{16,128})$/;

export const hashApiKey = (key: string): string =>
  createHash('sha256').update(key).digest('hex');

export interface GeneratedApiKey {
  /** Full secret — returned once, never stored. */
  readonly key: string;
  /** Public lookup id (also shown so users can identify the key). */
  readonly prefix: string;
  /** SHA-256 of `key`, stored at rest. */
  readonly hash: string;
}

export const generateApiKey = (): GeneratedApiKey => {
  const prefix = randomBytes(PREFIX_BYTES).toString('hex');
  const secret = randomBytes(SECRET_BYTES).toString('hex');
  const key = `tvk_${prefix}_${secret}`;
  return { key, prefix, hash: hashApiKey(key) };
};

/** Extract the lookup prefix from a presented key, or null if malformed. */
export const parseApiKeyPrefix = (key: string): string | null => {
  const m = KEY_RE.exec(key);
  return m ? m[1]! : null;
};

/** Constant-time check that `key` hashes to `expectedHash`. */
export const verifyApiKey = (key: string, expectedHash: string): boolean => {
  const actual = Buffer.from(hashApiKey(key), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
};
