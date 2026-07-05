// app/api/auth/precheck/route.ts

/**
 * Advisory-only endpoint: tells the login page whether the account it's
 * about to authenticate requires an MFA code, WITHOUT completing a
 * login or recording it as an authoritative attempt (that happens once
 * in NextAuth's authorize() / TokenController.login, which re-verify
 * the password themselves). Rate-limited aggressively since it accepts
 * a password, same as the real login endpoints.
 */
import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { mfaService } from '@/modules/security/services/mfa.service';
import { threatDetectionService } from '@/modules/security/services/threat-detection.service';
import { rateLimiter } from '@/infrastructure/security/rate-limit';

const precheckSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const AUTH_TENANT_ID = 'default';

export async function POST(req: NextRequest) {
  const { allowed } = rateLimiter.checkLimit(req, {
    windowMs: 60_000,
    maxRequests: 10,
    keyGenerator: (r) => `precheck:${r.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'}`,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = precheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();

  const lockStatus = await threatDetectionService.isLocked(email, AUTH_TENANT_ID);
  if (lockStatus.locked) {
    return NextResponse.json(
      { error: 'This account is temporarily locked. Please try again later.' },
      { status: 423 }
    );
  }

  const db = await connectToDatabase();
  const admin = await db.collection('tbladmin').findOne({ Email: parsed.data.email });
  if (!admin) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  const validPassword = await compare(parsed.data.password, admin.Password);
  if (!validPassword) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  const mfaRequired = await mfaService.isEnabled(admin._id.toString(), admin.tenantId || AUTH_TENANT_ID);
  return NextResponse.json({ valid: true, mfaRequired });
}