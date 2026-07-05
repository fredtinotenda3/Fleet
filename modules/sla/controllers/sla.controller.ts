// modules/sla/controllers/sla.controller.ts
import { NextRequest } from 'next/server';
import { slaService } from '../services/sla.service';
import { successResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class SLAController {
  async listPolicies(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await slaService.listPolicies(tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createPolicy(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await slaService.createPolicy(body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async processDue(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await slaService.processDueTrackings(tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[SLAController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const slaController = new SLAController();