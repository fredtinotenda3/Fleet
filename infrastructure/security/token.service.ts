// infrastructure/security/token.service.ts

import jwt, { Algorithm, JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import { getAccessSecret, getRefreshSecret } from './jwt-secrets';

export interface TokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions?: string[];
  sessionId?: string;
}

export interface VerifiedToken extends TokenPayload {
  iat: number;
  exp: number;
  jti: string;
  iss: string;
  aud: string;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const JWT_ALGORITHM: Algorithm = 'HS256';
const JWT_ISSUER = process.env.JWT_ISSUER || 'fleet-platform';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'fleet-platform-api';

/**
 * Hardened JWT / credential utility.
 *
 * Security properties enforced here:
 *  - Explicit algorithm allow-list (HS256 only) passed to both sign()
 *    and verify(), closing the classic "alg: none" / algorithm-confusion
 *    vulnerability class rather than trusting whatever the token header
 *    declares.
 *  - Every access token carries iss/aud/jti/sid claims. iss/aud are
 *    verified on every verify() call; jti is a unique per-token id for
 *    audit correlation; sid (session id) ties the token back to a
 *    revocable UserSession record so a compromised/logged-out session
 *    invalidates all tokens issued under it even though the JWT itself
 *    is otherwise self-contained/stateless.
 *  - Access tokens are short-lived (15m). Extended access is achieved
 *    exclusively through refresh token rotation (see
 *    modules/security/services/refresh-token.service.ts), never through
 *    long-lived access tokens.
 *  - Refresh tokens and API keys are opaque, high-entropy random strings
 *    that are never stored in plaintext â€” only their SHA-256 hash is
 *    persisted, the same principle as salted password hashing. A
 *    database read alone can never yield a usable credential.
 */
export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor() {
    /*
      Both secrets are resolved by the shared, edge-safe resolver, which
      THROWS on an unset, published-placeholder or too-short value.

      This replaced:

          this.accessSecret = process.env.NEXTAUTH_SECRET || 'default-secret-change-in-production';
          ...
          if (NODE_ENV === 'production' && startsWith('default-')) console.error('FATAL: ... Refusing ...')

      The message said "Refusing" and then signed anyway. See
      jwt-secrets.ts for why that is a full authentication bypass and
      why the guard is no longer conditioned on NODE_ENV.

      Throwing in the constructor is deliberate: `tokenService` is a
      module-level singleton, so this fires at import time and the
      process fails to start rather than serving requests with a
      forgeable key.
    */
    this.accessSecret = getAccessSecret();
    this.refreshSecret = getRefreshSecret();
  }

  generateAccessToken(payload: TokenPayload, jti: string = crypto.randomUUID()): string {
    return jwt.sign(
      {
        userId: payload.userId,
        tenantId: payload.tenantId,
        email: payload.email,
        roles: payload.roles,
        permissions: payload.permissions || [],
        sid: payload.sessionId,
      },
      this.accessSecret,
      {
        algorithm: JWT_ALGORITHM,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        jwtid: jti,
      }
    );
  }

  async verifyAccessToken(token: string): Promise<VerifiedToken> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        this.accessSecret,
        {
          algorithms: [JWT_ALGORITHM],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
        (err, decoded) => {
          if (err) return reject(err);
          const payload = decoded as JwtPayload;
          resolve({
            userId: payload.userId as string,
            tenantId: payload.tenantId as string,
            email: payload.email as string,
            roles: (payload.roles as string[]) || [],
            permissions: (payload.permissions as string[]) || [],
            sessionId: payload.sid as string | undefined,
            iat: payload.iat as number,
            exp: payload.exp as number,
            jti: payload.jti as string,
            iss: payload.iss as string,
            aud: payload.aud as string,
          });
        }
      );
    });
  }

  /** Legacy alias retained for existing call sites (e.g. websocket auth). */
  verifyToken(token: string): Promise<VerifiedToken> {
    return this.verifyAccessToken(token);
  }

  generateAccessTokenExpiry(): Date {
    return new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  }

  generateRefreshTokenExpiry(): Date {
    return new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  }

  getRefreshTokenTtlSeconds(): number {
    return REFRESH_TOKEN_TTL_SECONDS;
  }

  getAccessTokenTtlSeconds(): number {
    return ACCESS_TOKEN_TTL_SECONDS;
  }

  /**
   * Generates a 256-bit opaque token suitable for refresh tokens and API
   * keys. Deliberately NOT a JWT â€” these are random bearer secrets whose
   * validity can only be checked against the hashed value stored
   * server-side, which is what makes rotation, reuse-detection, and
   * instant revocation possible.
   */
  generateOpaqueToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /** SHA-256 hex digest, used to store refresh tokens / API keys at rest. */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  }

  /** Constant-time comparison for hex digests, to avoid timing side channels. */
  timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    } catch {
      return false;
    }
  }

  decodeToken(token: string): TokenPayload | null {
    try {
      return jwt.decode(token) as TokenPayload;
    } catch {
      return null;
    }
  }

  isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as { exp: number } | null;
      if (!decoded?.exp) return true;
      return decoded.exp * 1000 < Date.now();
    } catch {
      return true;
    }
  }
}

export const tokenService = new TokenService();

export const verifyToken = (token: string) => tokenService.verifyAccessToken(token);