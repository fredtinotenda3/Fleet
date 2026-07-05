// infrastructure/secrets/encryption.service.ts

import crypto from 'crypto';

/**
 * AES-256-GCM envelope encryption for secrets stored at rest (MFA TOTP
 * secrets, SSO client secrets). The key encryption key (KEK) itself is
 * never stored in the database — it comes from SECRETS_ENCRYPTION_KEY
 * (a base64-encoded 32-byte value), which in a hardened deployment
 * should itself be sourced via infrastructure/secrets/secrets-manager.service.ts
 * rather than a plain environment variable.
 *
 * Ciphertext format: "v1:<ivBase64>:<tagBase64>:<ciphertextBase64>"
 * Versioned so the algorithm/format can evolve without breaking
 * decryption of previously stored values.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[EncryptionService] SECRETS_ENCRYPTION_KEY is not set. Refusing to encrypt/decrypt secrets in production.'
      );
    }
    console.warn(
      '[EncryptionService] SECRETS_ENCRYPTION_KEY is not set — using an insecure development-only key. ' +
        'Set SECRETS_ENCRYPTION_KEY (32 random bytes, base64) before deploying.'
    );
    cachedKey = crypto.createHash('sha256').update('dev-only-insecure-key').digest();
    return cachedKey;
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('[EncryptionService] SECRETS_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  cachedKey = key;
  return cachedKey;
}

export class EncryptionService {
  encrypt(plaintext: string): string {
    const key = loadKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('[EncryptionService] Unrecognized ciphertext format');
    }
    const [, ivB64, tagB64, ciphertextB64] = parts;
    const key = loadKey();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }

  /** True if a string looks like ciphertext produced by encrypt(). */
  isEncrypted(value: string): boolean {
    return value.startsWith('v1:') && value.split(':').length === 4;
  }
}

export const encryptionService = new EncryptionService();