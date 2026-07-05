// modules/compliance/controllers/compliance.controller.ts
import { NextRequest } from 'next/server';
import { complianceService } from '../services/compliance.service';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class ComplianceController {
  async listRules(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const appliesTo = req.nextUrl.searchParams.get('appliesTo') as any;
      return successResponse(await complianceService.listRules(appliesTo || undefined, tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createRule(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await complianceService.createRule(body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async list(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const sp = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await complianceService.list((sp.get('entityType') as any) || undefined, sp.get('status') || undefined, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await complianceService.get(id, tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createRecord(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await complianceService.createRecord(body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async resolveRecord(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json().catch(() => ({}));
      return successResponse(await complianceService.resolveRecord(id, tenantId, userId, body?.documentUrl));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async waiveRecord(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { reason } = await req.json();
      if (!reason) throw new ValidationError('reason is required');
      return successResponse(await complianceService.waiveRecord(id, reason, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async recalculate(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await complianceService.recalculateStatuses(tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[ComplianceController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const complianceController = new ComplianceController();