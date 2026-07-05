// modules/security/controllers/user-scope.controller.ts

import { NextRequest } from 'next/server';
import { userScopeService } from '../services/user-scope.service';
import { userScopeAssignmentCreateSchema } from '@/shared/validations/security.schema';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class UserScopeController {
  async listForUser(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = req.nextUrl.searchParams.get('userId');
      if (!userId) {
        throw new ValidationError('userId query param is required');
      }
      const assignments = await userScopeService.listForUser(userId, tenantId);
      return successResponse(assignments);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listForOrgUnit(req: NextRequest, orgUnitId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const assignments = await userScopeService.listForOrgUnit(orgUnitId, tenantId);
      return successResponse(assignments);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async assign(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = userScopeAssignmentCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid scope assignment', parsed.error.flatten());
      }

      const assignment = await userScopeService.assign(
        { ...parsed.data, organizationId: tenantId },
        tenantId,
        userId
      );
      return createdResponse(assignment);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async revoke(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      await userScopeService.revoke(id, tenantId, userId);
      return successResponse({ message: 'Scope assignment revoked' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[UserScopeController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const userScopeController = new UserScopeController();