// infrastructure/security/edge-token-verify.ts
//
// Edge-runtime-safe counterpart to TokenService.verifyAccessToken().
// middleware.ts runs on the Edge runtime, which does not support
// Node's `crypto`/`jsonwebtoken` (what TokenService uses). `jose` is
// pure Web Crypto and works in both Edge and Node, so it's used here
// exclusively for the one place that *must* run on the Edge: the
// middleware auth check.
//
// This MUST stay in sync with infrastructure/security/token.service.ts:
// same secret env var, same algorithm, same issuer/audience. If you
// change one, change the other, or tokens signed by one will silently
// fail verification by the other.

import { jwtVerify } from 'jose';

const JWT_ISSUER = process.env.JWT_ISSUER || 'fleet-platform';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'fleet-platform-api';

function getAccessSecretKey(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET || 'default-secret-change-in-production';
  return new TextEncoder().encode(secret);
}

export interface EdgeVerifiedToken {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId?: string;
}

/**
 * Verifies a custom access token (the JWT issued by TokenService /
 * refreshTokenService) in an Edge-safe way. Returns null on any
 * failure (expired, bad signature, wrong issuer/audience, malformed) —
 * callers should treat null exactly like "no valid session", never
 * throw/500 for an absent or bad token.
 */
export async function verifyAccessTokenEdge(token: string): Promise<EdgeVerifiedToken | null> {
  try {
    const { payload } = await jwtVerify(token, getAccessSecretKey(), {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (!payload.userId || !payload.tenantId) return null;

    return {
      userId: payload.userId as string,
      tenantId: payload.tenantId as string,
      email: (payload.email as string) || '',
      roles: (payload.roles as string[]) || [],
      permissions: (payload.permissions as string[]) || [],
      sessionId: payload.sid as string | undefined,
    };
  } catch {
    // Expired, malformed, wrong signature, wrong issuer/audience — all
    // treated identically as "not authenticated."
    return null;
  }
}

export const ACCESS_TOKEN_COOKIE_NAME = 'fleet_access_token';