import sodium from 'libsodium-wrappers';
import { ValidationError } from '@tv/core';

const VERSION = 'tvcred1';

const keyFromHex = async (keyHex: string): Promise<Uint8Array> => {
  await sodium.ready;
  const key = sodium.from_hex(keyHex);
  if (key.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new ValidationError('CRED_ENC_KEY must be 32 bytes');
  }
  return key;
};

export const encryptCredentialPayload = async (
  payload: unknown,
  keyHex: string,
): Promise<string> => {
  await sodium.ready;
  const key = await keyFromHex(keyHex);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const message = sodium.from_string(JSON.stringify(payload));
  const cipher = sodium.crypto_secretbox_easy(message, nonce, key);
  return [
    VERSION,
    sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
    sodium.to_base64(cipher, sodium.base64_variants.ORIGINAL),
  ].join(':');
};

export const decryptCredentialPayload = async (
  encrypted: string,
  keyHex: string,
): Promise<unknown> => {
  await sodium.ready;
  const [version, nonceText, cipherText] = encrypted.split(':');
  if (version !== VERSION || !nonceText || !cipherText) {
    throw new ValidationError('Invalid encrypted credential payload');
  }
  const key = await keyFromHex(keyHex);
  const nonce = sodium.from_base64(nonceText, sodium.base64_variants.ORIGINAL);
  const cipher = sodium.from_base64(cipherText, sodium.base64_variants.ORIGINAL);
  const message = sodium.crypto_secretbox_open_easy(cipher, nonce, key);
  if (!message) {
    throw new ValidationError('Unable to decrypt broker credentials');
  }
  return JSON.parse(sodium.to_string(message)) as unknown;
};
