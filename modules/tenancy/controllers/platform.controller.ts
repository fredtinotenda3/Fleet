// modules/tenancy/controllers/platform.controller.ts

import { NextRequest } from 'next/server';
import { platformService } from '../services/platform.service';
import { platformOrgStatusSchema } from '@/shared/validations/tenancy.schema';
import { successResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ForbiddenError, ValidationError } from '@/server/errors/app.errors';
import { getAuthContext } from '@/server/auth/auth-context';
import { Role } from '@/server/permissions/roles';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';

/**
 * Every method here requires the caller's JWT to carry the literal
 * Role.SUPER_ADMIN role. This is intentionally NOT the `isSuperAdmin`
 * flag used elsewhere (AuthContext.isSuperAdmin is also true for
 * organization_owner, since both currently map to every static
 * Permission â€” see server/permissions/roles.ts). Platform endpoints
 * reach across every tenant, so an organization_owner â€” who is
 * privileged only within their own tenant â€” must never pass this guard.
 */
async function requirePlatformAdmin(req: NextRequest) {
  const context = await getAuthContext(req);
  if (!context) {
    throw new ForbiddenError('Authentication required');
  }
  if (!context.roles.includes(Role.SUPER_ADMIN)) {
    throw new ForbiddenError('Platform administrator access required');
  }
  return context;
}

export class PlatformController {
  async listOrganizations(req: NextRequest) {
    try {
      await requirePlatformAdmin(req);
      const searchParams = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(
        searchParams.get('page'),
        searchParams.get('limit')
      );

      const result = await platformService.listOrganizations(
        {
          status: (searchParams.get('status') as any) || undefined,
          tier: (searchParams.get('tier') as any) || undefined,
          search: searchParams.get('search') || undefined,
        },
        { page, limit }
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getOrganization(req: NextRequest, id: string) {
    try {
      await requirePlatformAdmin(req);
      const org = await platformService.getOrganization(id);
      return successResponse(org);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async setOrganizationStatus(req: NextRequest, id: string) {
    try {
      const context = await requirePlatformAdmin(req);
      const body = await req.json();

      const parsed = platformOrgStatusSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid status update', parsed.error.flatten());
      }

      const updated = await platformService.setOrganizationStatus(
        id,
        parsed.data.status,
        context.userId,
        parsed.data.reason
      );

      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getStats(req: NextRequest) {
    try {
      await requirePlatformAdmin(req);
      const stats = await platformService.getPlatformStats();
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[PlatformController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const platformController = new PlatformController();