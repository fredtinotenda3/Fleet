// modules/security/controllers/threat-detection.controller.ts

import { NextRequest } from 'next/server';
import { threatDetectionService } from '../services/threat-detection.service';
import { auditLogRepository } from '../repositories/audit-log.repository';
import { accountUnlockSchema } from '@/shared/validations/audit-log.schema';
import { successResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError, isAppError, describeError } from '@/server/errors/app.errors';
import { AuthContext } from '@/server/auth/auth-context';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';

export class ThreatDetectionController {
  async listRecentEvents(req: NextRequest, context: AuthContext) {
    try {
      const { page, limit } = validatePaginationParams(
        req.nextUrl.searchParams.get('page'),
        req.nextUrl.searchParams.get('limit')
      );

      /*
        CROSS-TENANT LEAK, FIXED -- and worse than the audit-log one,
        because the fallback here is `undefined` rather than a
        caller-supplied slug, and `findWithFilters` applies the tenant
        predicate only when it is truthy. So an ORGANIZATION_OWNER did
        not even have to name a target: this returned EVERY tenant's
        security events -- failed logins, brute-force detections,
        lockouts, with email addresses.

        `isSuperAdmin` is the deprecated alias of `canBypassRbac`, which
        is true for ORGANIZATION_OWNER. `isPlatformAdmin` is
        SUPER_ADMIN only, and is the only flag that may widen a read
        past one tenant.
      */
      const result = await auditLogRepository.findWithFilters(
        {
          category: 'security',
          tenantId: context.isPlatformAdmin ? undefined : context.tenantId,
        },
        { page, limit }
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listLockedAccounts(req: NextRequest, context: AuthContext) {
    try {
      // Same fix: `listLockedAccounts(undefined)` drops the tenant
      // predicate entirely (login-attempt.repository.ts), so this
      // returned every locked account on the platform to any org owner.
      const accounts = await threatDetectionService.listLockedAccounts(
        context.isPlatformAdmin ? undefined : context.tenantId
      );
      return successResponse(accounts);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async unlockAccount(req: NextRequest, context: AuthContext, email: string) {
    try {
      const body = await req.json().catch(() => ({}));
      const parsed = accountUnlockSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid unlock request', parsed.error.flatten());
      }

      await threatDetectionService.unlockAccount(
        decodeURIComponent(email),
        context.tenantId,
        context.userId
      );

      return successResponse({ message: 'Account unlocked successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ThreatDetectionController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const threatDetectionController = new ThreatDetectionController();