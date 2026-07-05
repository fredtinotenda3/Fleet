// modules/security/controllers/token.controller.ts

import { NextRequest } from 'next/server';
import { compare } from 'bcryptjs';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { refreshTokenService } from '../services/refresh-token.service';
import { threatDetectionService } from '../services/threat-detection.service';
import { mfaService } from '../services/mfa.service';
import { tokenLoginSchema, tokenRefreshSchema, tokenRevokeSchema } from '@/shared/validations/auth-token.schema';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, UnauthorizedError, ValidationError } from '@/server/errors/app.errors';
import { rateLimiter } from '@/infrastructure/security/rate-limit';

function getClientIp(req: NextRequest): string | undefined {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
}

/**
 * Issues/rotates/revokes OAuth2-style token pairs for programmatic API
 * clients (mobile apps, third-party integrations). See
 * modules/security/services/refresh-token.service.ts for the rotation
 * model. As of Slice 6d, `login` also gates on MFA: if the account has
 * a verified TOTP factor, a login request without `code`/`backupCode`
 * returns `{ mfaRequired: true }` instead of tokens — the client
 * resubmits the SAME login body with the code added. There is no
 * separate challenge id to track or expire: every attempt re-verifies
 * the password from scratch, so there is nothing extra to leak.
 */
export class TokenController {
  async login(req: NextRequest) {
    try {
      const { allowed, reset } = rateLimiter.checkLimit(req, {
        windowMs: 60_000,
        maxRequests: 5,
        keyGenerator: (r) => `token-login:${getClientIp(r) || 'unknown'}`,
      });
      if (!allowed) {
        return errorResponse('Too many login attempts. Please try again shortly.', 'RATE_LIMITED', 429, { reset });
      }

      const body = await req.json();
      const parsed = tokenLoginSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid login request', parsed.error.flatten());
      }

      const email = parsed.data.email.toLowerCase();
      const ipAddress = getClientIp(req);
      const userAgent = req.headers.get('user-agent') || undefined;

      const lockStatus = await threatDetectionService.isLocked(email, 'default');
      if (lockStatus.locked) {
        throw new UnauthorizedError(
          'This account is temporarily locked due to repeated failed login attempts. Please try again later.'
        );
      }

      const db = await connectToDatabase();
      const admin = await db.collection('tbladmin').findOne({ Email: parsed.data.email });

      if (!admin) {
        await threatDetectionService.recordLoginAttempt({
          email,
          tenantId: 'default',
          ipAddress,
          userAgent,
          success: false,
        });
        throw new UnauthorizedError('Invalid email or password');
      }

      const validPassword = await compare(parsed.data.password, admin.Password);
      const tenantId = admin.tenantId || 'default';

      if (!validPassword) {
        const attemptResult = await threatDetectionService.recordLoginAttempt({
          email,
          tenantId: 'default',
          userId: admin._id.toString(),
          ipAddress,
          userAgent,
          success: false,
        });
        if (attemptResult.locked) {
          throw new UnauthorizedError(
            'This account is temporarily locked due to repeated failed login attempts. Please try again later.'
          );
        }
        throw new UnauthorizedError('Invalid email or password');
      }

      const userId = admin._id.toString();
      const mfaEnabled = await mfaService.isEnabled(userId, tenantId);

      if (mfaEnabled) {
        if (!parsed.data.code && !parsed.data.backupCode) {
          // Password stage succeeded but the second factor is still
          // outstanding — issue nothing, and don't count this as a
          // failed attempt against the lockout counter.
          return successResponse({ mfaRequired: true });
        }

        const { valid } = await mfaService.verifyCode(userId, tenantId, parsed.data.code, parsed.data.backupCode);
        if (!valid) {
          await threatDetectionService.recordLoginAttempt({
            email,
            tenantId: 'default',
            userId,
            ipAddress,
            userAgent,
            success: false,
          });
          throw new UnauthorizedError('Invalid authentication code');
        }
      }

      await threatDetectionService.recordLoginAttempt({
        email,
        tenantId: 'default',
        userId,
        ipAddress,
        userAgent,
        success: true,
      });

      const roles: string[] = admin.roles || ['super_admin', 'organization_owner'];

      const pair = await refreshTokenService.issueTokenPair({
        userId,
        tenantId,
        email: admin.Email,
        roles,
        ipAddress,
        userAgent,
        deviceLabel: parsed.data.deviceLabel,
      });

      return successResponse(pair);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async refresh(req: NextRequest) {
    try {
      const body = await req.json();
      const parsed = tokenRefreshSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid refresh request', parsed.error.flatten());
      }

      const pair = await refreshTokenService.rotate(parsed.data.refreshToken, parsed.data.tenantId || 'default', {
        ipAddress: getClientIp(req),
        userAgent: req.headers.get('user-agent') || undefined,
      });

      return successResponse(pair);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async revoke(req: NextRequest) {
    try {
      const body = await req.json();
      const parsed = tokenRevokeSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid revoke request', parsed.error.flatten());
      }

      await refreshTokenService.revoke(parsed.data.refreshToken, parsed.data.tenantId || 'default', 'User logout');
      return successResponse({ message: 'Logged out successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[TokenController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const tokenController = new TokenController();