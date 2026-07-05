// infrastructure/security/security-headers.ts

import { NextResponse } from 'next/server';

/**
 * OWASP-recommended baseline security headers, applied to every
 * response the app returns — both from server/utils/response.utils.ts
 * (API JSON responses) and middleware.ts (page navigations). Centralizing
 * this in one function means a header added or tightened here takes
 * effect everywhere at once instead of drifting between the two call
 * sites.
 */
const STATIC_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'X-DNS-Prefetch-Control': 'off',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/**
 * Starting-point CSP. `unsafe-inline`/`unsafe-eval` on script-src are
 * required by Next.js's current inline bootstrap scripts; tightening
 * further requires adopting nonce- or hash-based CSP via next.config,
 * which is a follow-up hardening task, not a Slice 6d blocker.
 */
function buildCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export function applySecurityHeaders<T = unknown>(response: NextResponse<T>): NextResponse<T> {
  for (const [key, value] of Object.entries(STATIC_HEADERS)) {
    response.headers.set(key, value);
  }

  response.headers.set('Content-Security-Policy', buildCsp());

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}