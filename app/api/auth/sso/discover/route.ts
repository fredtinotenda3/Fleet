// app/api/auth/sso/discover/route.ts

/**
 * Public endpoint the login page calls with a typed email address to
 * decide whether to show "Continue with SSO" before the user enters a
 * password. Deliberately returns the minimum needed (availability +
 * connectionId + display name) — never issuer/client details.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ssoService } from '@/modules/security/services/sso.service';
import { ssoDiscoverQuerySchema } from '@/shared/validations/sso.schema';
import { rateLimiter } from '@/infrastructure/security/rate-limit';

export async function GET(req: NextRequest) {
  const { allowed } = rateLimiter.checkLimit(req, { windowMs: 60_000, maxRequests: 20 });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const email = req.nextUrl.searchParams.get('email') || '';
  const parsed = ssoDiscoverQuerySchema.safeParse({ email });
  if (!parsed.success) {
    return NextResponse.json({ ssoAvailable: false }, { status: 200 });
  }

  const result = await ssoService.discoverByEmail(parsed.data.email);
  return NextResponse.json(result);
}