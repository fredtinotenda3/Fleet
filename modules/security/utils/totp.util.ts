// modules/security/utils/totp.util.ts

import crypto from 'crypto';

/**
 * Self-contained TOTP (RFC 6238) / HOTP (RFC 4226) implementation using
 * only Node's built-in crypto module — no external OTP library
 * dependency required. Compatible with standard authenticator apps
 * (Google Authenticator, Authy, 1Password, etc.), which all speak this
 * exact protocol.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // allow ±1 step (±30s) of clock drift

export function generateBase32Secret(byteLength: number = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  return base32Encode(bytes);
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number, digits: number = TOTP_DIGITS): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binCode % 10 ** digits).padStart(digits, '0');
}

/** Generates the current TOTP code for a base32 secret — used only in tests/debugging. */
export function generateTotp(base32Secret: string, timestampMs: number = Date.now()): string {
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);
  return hotp(base32Decode(base32Secret), counter);
}

/**
 * Verifies a user-submitted code against a base32 secret, checking the
 * current step and ±TOTP_WINDOW adjacent steps to tolerate clock drift
 * and submission latency. Uses a constant-time string comparison for
 * each candidate to avoid timing side channels.
 */
export function verifyTotp(
  base32Secret: string,
  code: string,
  timestampMs: number = Date.now(),
  window: number = TOTP_WINDOW
): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  const secretBytes = base32Decode(base32Secret);
  const currentCounter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const candidate = hotp(secretBytes, currentCounter + errorWindow);
    if (timingSafeEqual(candidate, code)) {
      return true;
    }
  }
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** Builds an otpauth:// URI for QR-code rendering by any standard authenticator app. */
export function buildOtpauthUri(params: {
  secret: string;
  accountName: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${params.issuer}:${params.accountName}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/** Generates human-friendly, high-entropy backup codes (e.g. "7K3F1-9QXZ2"). */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

export function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase().trim(), 'utf8').digest('hex');
}