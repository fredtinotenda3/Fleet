// modules/security/controllers/role.controller.ts

import { NextRequest } from 'next/server';
import { customRoleService } from '../services/custom-role.service';
import { customRoleCreateSchema, customRoleUpdateSchema } from '@/shared/validations/security.schema';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class RoleController {
  async listRoles(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const activeOnly = req.nextUrl.searchParams.get('activeOnly') !== 'false';
      const roles = await customRoleService.listRoles(tenantId, activeOnly);
      return successResponse(roles);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getRole(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const role = await customRoleService.getRole(id, tenantId);
      return successResponse(role);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createRole(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = customRoleCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid role definition', parsed.error.flatten());
      }

      const role = await customRoleService.createRole(
        { ...parsed.data, organizationId: tenantId },
        tenantId,
        userId
      );
      return createdResponse(role);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateRole(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = customRoleUpdateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid role update', parsed.error.flatten());
      }

      const role = await customRoleService.updateRole(id, parsed.data, tenantId, userId);
      return successResponse(role);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteRole(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      await customRoleService.deleteRole(id, tenantId, userId);
      return successResponse({ message: 'Custom role deleted' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listPermissionDefinitions(req: NextRequest) {
    try {
      const { permissionRegistry } = await import('../registry/PermissionRegistry');
      const { bootstrapPermissionRegistry } = await import('../registry/bootstrap-permission-registry');
      bootstrapPermissionRegistry();

      const category = req.nextUrl.searchParams.get('category');
      const definitions = category
        ? permissionRegistry.getByCategory(category)
        : permissionRegistry.getAll();

      return successResponse(definitions);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[RoleController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const roleController = new RoleController();