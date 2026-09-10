// modules/security/controllers/audit-log.controller.ts

import { NextRequest } from 'next/server';
import { auditLogRepository } from '../repositories/audit-log.repository';
import { auditChainService } from '../services/audit-chain.service';
import { auditLogQuerySchema } from '@/shared/validations/audit-log.schema';
import { successResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, NotFoundError, ValidationError, isAppError, describeError } from '@/server/errors/app.errors';
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

      /*
        CROSS-TENANT LEAK, FIXED.

        This read `context.isSuperAdmin`, which is the DEPRECATED ALIAS
        of `canBypassRbac` -- and canBypassRbac is true for
        ORGANIZATION_OWNER as well as SUPER_ADMIN. The declaration of
        that field says so in as many words: "@deprecated Alias of
        canBypassRbac. Never use for data scoping."

        The consequence: any ORGANIZATION_OWNER could pass
        `?tenantId=<another-org-slug>` and receive that organisation's
        entire audit ledger -- user ids, entity ids, role changes,
        deletions. Organisation ownership is self-service (POST
        /api/organizations carries no permission), so the attack cost
        was one signup.

        `isPlatformAdmin` is Role.SUPER_ADMIN and nothing else. It is
        the only flag that may widen a data read beyond one tenant.
      */
      const scopedFilters = {
        ...filters,
        tenantId: context.isPlatformAdmin ? filters.tenantId : context.tenantId,
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

      // Same fix as list(): isSuperAdmin is true for ORGANIZATION_OWNER,
      // so this let any org owner read any single audit entry on the
      // platform by id.
      if (!context.isPlatformAdmin && entry.tenantId !== context.tenantId) {
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
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[AuditLogController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const auditLogController = new AuditLogController();