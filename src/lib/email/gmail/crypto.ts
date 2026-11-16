import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * AES-256-GCM encryption for the provider refresh token.
 *
 * The key is derived from EMAIL_ENCRYPTION_KEY (a base64-encoded 32-byte
 * value) using scrypt. Each ciphertext carries a random 12-byte IV prepended
 * and the GCM auth tag appended.
 *
 * Validation is lazy: the key is only required when encrypt/decrypt is
 * called, so the module loads cleanly when Gmail is not configured
 * (EMAIL_PROVIDER=resend).
 *
 * Server-only: the key never reaches the client bundle.
 */

let ENC_KEY: Buffer | null = null;
let KEY_ERROR: Error | null = null;

function ensureKey(): Buffer {
  if (ENC_KEY) return ENC_KEY;
  if (KEY_ERROR) throw KEY_ERROR;
  const KEY_SOURCE = process.env.EMAIL_ENCRYPTION_KEY;
  if (!KEY_SOURCE) {
    KEY_ERROR = new Error(
      "[email/gmail] EMAIL_ENCRYPTION_KEY is not set — Gmail email is unavailable",
    );
    throw KEY_ERROR;
  }
  ENC_KEY = scryptSync(KEY_SOURCE, "powerweave-email-gmail-v1", 32);
  return ENC_KEY;
}

const IV_LEN = 12;

export function encrypt(plaintext: string): string {
  const key = ensureKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

export function decrypt(ciphertextB64: string): string {
  const key = ensureKey();
  const data = Buffer.from(ciphertextB64, "base64");
  if (data.length < IV_LEN + 16) {
    throw new Error("[email/gmail] malformed ciphertext");
  }
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(data.length - 16);
  const body = data.subarray(IV_LEN, data.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(body),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
