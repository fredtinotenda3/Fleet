
// frontend/modules/auth/utils/index.ts

export interface AccessTokenClaims {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
  exp?: number;
}

/**
 * Decodes (without verifying) the payload of the short-lived JWT
 * access token so the client can populate basic profile fields
 * immediately after login, without a round trip. This is display-only
 * convenience -- every API call is still authorized server-side via
 * infrastructure/security/token.service.ts's signature verification.
 */
export function decodeAccessTokenClaims(token: string): AccessTokenClaims | null {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      roles: payload.roles || [],
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function isTokenExpiringSoon(expiresAt: string, thresholdMs = 60_000): boolean {
  return new Date(expiresAt).getTime() - Date.now() < thresholdMs;
}

export function formatDeviceLabel(userAgent?: string): string {
  if (!userAgent) return 'Unknown device';
  if (/mobile/i.test(userAgent)) return 'Mobile device';
  if (/mac os/i.test(userAgent)) return 'Mac';
  if (/windows/i.test(userAgent)) return 'Windows PC';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Unknown device';
}
