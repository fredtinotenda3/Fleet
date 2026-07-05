// modules/security/controllers/audit-log.controller.ts

import { NextRequest } from 'next/server';
import { auditLogRepository } from '../repositories/audit-log.repository';
import { auditChainService } from '../services/audit-chain.service';
import { auditLogQuerySchema } from '@/shared/validations/audit-log.schema';
import { successResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { AuthContext } from '@/server/auth/auth-context';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { AuditChainIntegrityFailureEvent } from '../events/security-audit.events';

export class AuditLogController {
  async list(req: NextRequest, context: AuthContext) {
    try {
      const searchParams = req.nextUrl.searchParams;

      const parsed = auditLogQuerySchema.safeParse({
        category: searchParams.get('category') || undefined,
        severity: searchParams.get('severity') || undefined,
        action: searchParams.get('action') || undefined,
        entityType: searchParams.get('entityType') || undefined,
        entityId: searchParams.get('entityId') || undefined,
        userId: searchParams.get('userId') || undefined,
        startDate: searchParams.get('startDate') || undefined,
        endDate: searchParams.get('endDate') || undefined,
        // Only meaningful for super admins (see scopedFilters below), but
        // harmless to pass through otherwise — zod strips unknown keys.
        tenantId: searchParams.get('tenantId') || undefined,
        page: searchParams.get('page') || undefined,
        limit: searchParams.get('limit') || undefined,
      });

      if (!parsed.success) {
        throw new ValidationError('Invalid audit log query', parsed.error.flatten());
      }

      // `tenantId` may not be part of the declared schema output yet; cast
      // narrowly here rather than assuming its shape.
      const { page, limit, ...filters } = parsed.data as typeof parsed.data & {
        tenantId?: string;
      };

      // Non-super-admins only ever see their own tenant's ledger entries,
      // regardless of what (if anything) they pass as a filter.
      const scopedFilters = {
        ...filters,
        tenantId: context.isSuperAdmin ? filters.tenantId : context.tenantId,
      };

      const result = await auditLogRepository.findWithFilters(scopedFilters, { page, limit });
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, context: AuthContext, id: string) {
    try {
      const entry = await auditLogRepository.getEntry(id);
      if (!entry) throw new NotFoundError('Audit log entry not found');

      if (!context.isSuperAdmin && entry.tenantId !== context.tenantId) {
        throw new NotFoundError('Audit log entry not found');
      }

      return successResponse(entry);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async verify(req: NextRequest) {
    try {
      const fromParam = req.nextUrl.searchParams.get('fromSequence');
      const fromSequence = fromParam ? Math.max(1, parseInt(fromParam, 10)) : 1;

      const result = await auditChainService.verifyIntegrity(fromSequence);

      if (!result.valid && result.brokenAtSequence) {
        const eventBus = EventBusFactory.getInstance();
        await eventBus.publish(
          new AuditChainIntegrityFailureEvent(result.brokenAtSequence, result.reason || 'unknown')
        );
      }

      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[AuditLogController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const auditLogController = new AuditLogController();