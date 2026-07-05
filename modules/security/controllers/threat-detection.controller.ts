// modules/security/controllers/threat-detection.controller.ts

import { NextRequest } from 'next/server';
import { threatDetectionService } from '../services/threat-detection.service';
import { auditLogRepository } from '../repositories/audit-log.repository';
import { accountUnlockSchema } from '@/shared/validations/audit-log.schema';
import { successResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { AuthContext } from '@/server/auth/auth-context';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';

export class ThreatDetectionController {
  async listRecentEvents(req: NextRequest, context: AuthContext) {
    try {
      const { page, limit } = validatePaginationParams(
        req.nextUrl.searchParams.get('page'),
        req.nextUrl.searchParams.get('limit')
      );

      const result = await auditLogRepository.findWithFilters(
        {
          category: 'security',
          tenantId: context.isSuperAdmin ? undefined : context.tenantId,
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
      const accounts = await threatDetectionService.listLockedAccounts(
        context.isSuperAdmin ? undefined : context.tenantId
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
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ThreatDetectionController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const threatDetectionController = new ThreatDetectionController();