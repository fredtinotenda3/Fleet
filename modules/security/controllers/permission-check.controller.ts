// modules/security/controllers/permission-check.controller.ts

import { NextRequest } from 'next/server';
import { permissionEngineService } from '../services/permission-engine.service';
import { permissionCheckRequestSchema } from '@/shared/validations/security.schema';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { AuthContext } from '@/server/auth/auth-context';

export class PermissionCheckController {
  async check(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();

      const parsed = permissionCheckRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid permission check request', parsed.error.flatten());
      }

      const decision = await permissionEngineService.can({
        userId: context.userId,
        tenantId: context.tenantId,
        roles: context.roles,
        isSuperAdmin: context.isSuperAdmin,
        permission: parsed.data.permission,
        resource: parsed.data.resource,
      });

      return successResponse(decision);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[PermissionCheckController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const permissionCheckController = new PermissionCheckController();