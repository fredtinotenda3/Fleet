// modules/dvir/controllers/dvir.controller.ts

import { NextRequest } from 'next/server';
import { dvirService } from '../services/dvir.service';
import { DVIRFilters, DVIRCreateDTO } from '../types/dvir.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { resolveTenantContext, resolveTenantContextWithUser } from '@/server/utils/tenant-context.utils';
import { adminUserRepository } from '@/modules/organizations/repositories/admin-user.repository';

export class DVIRController {
  async list(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const sp = req.nextUrl.searchParams;
      const filters: DVIRFilters = {
        license_plate: sp.get('license_plate') || undefined,
        driverId: sp.get('driverId') || undefined,
        type: (sp.get('type') as any) || undefined,
        overallStatus: (sp.get('overallStatus') as any) || undefined,
        outOfService: sp.has('outOfService') ? sp.get('outOfService') === 'true' : undefined,
      };
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await dvirService.list(filters, { page, limit }, context);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      return successResponse(await dvirService.get(id, context.organizationId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async submit(req: NextRequest) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = (await req.json()) as DVIRCreateDTO;

      // The submitting driver is the authenticated user, not a
      // client-supplied field -- a driver cannot file an inspection
      // under someone else's name. There is no dedicated tbldrivers <->
      // tbladmin link in this codebase yet (see the comment on
      // DriverRepository.getFilteredDriversInScope), so the driver's
      // identity for a DVIR submission is the authenticated user
      // themselves: their tbladmin record supplies a display name for
      // the inspection and any auto-created work order.
      let driverName: string | undefined;
      try {
        const adminUser = await adminUserRepository.findById(userId);
        driverName = adminUser?.FirstName;
      } catch {
        // No resolvable admin-user record -- proceed without a display name.
      }

      const created = await dvirService.submit(body, context, userId, driverName, userId);
      return createdResponse(created);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[DVIRController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const dvirController = new DVIRController();
