// modules/security/controllers/resource-permission.controller.ts

import { NextRequest } from 'next/server';
import { resourcePermissionService } from '../services/resource-permission.service';
import { resourcePermissionCreateSchema } from '@/shared/validations/security.schema';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { PermissionEffect, PermissionSubjectType } from '../types/resource-permission.types';

export class ResourcePermissionController {
  async list(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const grants = await resourcePermissionService.list({
        organizationId: tenantId,
        subjectType: (searchParams.get('subjectType') as PermissionSubjectType) || undefined,
        subjectId: searchParams.get('subjectId') || undefined,
        permission: searchParams.get('permission') || undefined,
        resourceType: searchParams.get('resourceType') || undefined,
        resourceId: searchParams.get('resourceId') || undefined,
        orgUnitId: searchParams.get('orgUnitId') || undefined,
        effect: (searchParams.get('effect') as PermissionEffect) || undefined,
      });

      return successResponse(grants);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const grant = await resourcePermissionService.get(id, tenantId);
      return successResponse(grant);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async grant(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = resourcePermissionCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid resource permission grant', parsed.error.flatten());
      }

      const grant = await resourcePermissionService.grant(
        { ...parsed.data, organizationId: tenantId },
        tenantId,
        userId
      );
      return createdResponse(grant);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async revoke(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      await resourcePermissionService.revoke(id, tenantId, userId);
      return successResponse({ message: 'Resource permission grant revoked' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ResourcePermissionController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const resourcePermissionController = new ResourcePermissionController();