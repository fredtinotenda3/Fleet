// modules/security/controllers/org-unit.controller.ts

import { NextRequest } from 'next/server';
import { orgUnitService } from '../services/org-unit.service';
import { orgUnitCreateSchema, orgUnitUpdateSchema } from '@/shared/validations/security.schema';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { OrgUnitType } from '../types/org-unit.types';

export class OrgUnitController {
  async listOrgUnits(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const typeParam = searchParams.get('type');
      const parentIdParam = searchParams.get('parentId');

      const units = await orgUnitService.listOrgUnits({
        organizationId: tenantId,
        type: (typeParam as OrgUnitType) || undefined,
        parentId: parentIdParam === 'null' ? null : parentIdParam || undefined,
      });
      return successResponse(units);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getOrgUnit(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const unit = await orgUnitService.getOrgUnit(id, tenantId);
      return successResponse(unit);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createOrgUnit(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = orgUnitCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid org unit definition', parsed.error.flatten());
      }

      const unit = await orgUnitService.createOrgUnit({ ...parsed.data, organizationId: tenantId }, userId);
      return createdResponse(unit);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateOrgUnit(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = orgUnitUpdateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid org unit update', parsed.error.flatten());
      }

      const unit = await orgUnitService.updateOrgUnit(id, parsed.data, tenantId, userId);
      return successResponse(unit);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteOrgUnit(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      await orgUnitService.deleteOrgUnit(id, tenantId, userId);
      return successResponse({ message: 'Org unit deleted' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[OrgUnitController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const orgUnitController = new OrgUnitController();