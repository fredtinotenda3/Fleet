// modules/drivers/controllers/driver.controller.ts

import { NextRequest } from 'next/server';
import { driverService } from '../services/driver.service';
import { DriverFilters, DriverStatus } from '@/shared/types/driver.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError, isAppError, describeError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { driverRepository } from '@/modules/drivers/repositories/driver.repository';
import { resolveCreationOrgUnitId } from '@/server/utils/tenant-context.utils';

export class DriverController {
  async list(req: NextRequest) {
    try {
      /**
       * LEAK FIX. This was the most visible remaining leak: the Drivers
       * page listed all 77 drivers to every scoped user, including
       * bulawayo.manager and unassigned. The repository has had
       * getFilteredDriversInScope since Phase B -- the controller simply
       * never called it.
       *
       * Note the picker branch below (no `page` param) is scoped too. A
       * picker that offers out-of-scope drivers leaks the same roster as
       * the table, and is easier to overlook because it renders inside a
       * dropdown rather than on a page.
       */
      const context = await resolveTenantContext(req);
      const searchParams = req.nextUrl.searchParams;

      const filters: DriverFilters = {
        search: searchParams.get('search') || undefined,
        status: (searchParams.get('status') as DriverStatus) || undefined,
      };

      const pageParam = searchParams.get('page');
      if (!pageParam) {
        // Matches FuelStationController/FuelCardController: no `page`
        // param -> return a bare array for pickers (DriverSelect,
        // FuelForm, FuelFilters) that just want the full roster.
        const result = await driverRepository.getFilteredDriversInScope(
          filters,
          context,
          { page: 1, limit: 1000 }
        );
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(pageParam, searchParams.get('limit'));
      const result = await driverRepository.getFilteredDriversInScope(
        filters,
        context,
        { page, limit }
      );
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getById(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const driver = await driverService.getById(id, tenantId);
      return successResponse(driver);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      /**
       * Drivers were the last create path not stamping orgUnitId. A
       * driver created by a scoped user landed with no unit and was then
       * hidden by the scoped read filter -- they add a driver and watch
       * it disappear, which reads as data loss rather than a scoping
       * rule.
       */
      const createContext = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const orgUnitId = resolveCreationOrgUnitId(createContext, (body as any)?.orgUnitId);
      const driver = await driverService.create(
        { ...(body as Record<string, unknown>), orgUnitId },
        createContext.organizationId,
        userId
      );
      return createdResponse(driver);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const driver = await driverService.update(id, body, tenantId, userId);
      return successResponse(driver);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async remove(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';
      await driverService.remove(id, tenantId, userId, soft);
      return successResponse({ message: 'Driver deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[DriverController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const driverController = new DriverController();