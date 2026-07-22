// modules/maintenance/controllers/maintenance.controller.ts

import { NextRequest } from 'next/server';
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { maintenanceCommandService } from '../services/maintenance-command.service';
import { maintenanceQueryService } from '../services/maintenance-query.service';
import { MaintenanceFilters } from '@/shared/types/maintenance.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError, NotFoundError, UnauthorizedError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { getAuthContext } from '@/server/auth/auth-context';
import { tenantContextService } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { maintenanceRepository } from '../repositories/maintenance.repository';

bootstrapCqrs();

/** Enterprise CSV import safety cap -- matches Vehicle/Fuel import limits. */
const MAX_IMPORT_ROWS = 2000;

export interface ImportRowResult {
  row: number;
  success: boolean;
  identifier?: string;
  error?: string;
}

export interface ImportResponse {
  summary: { total: number; succeeded: number; failed: number };
  results: ImportRowResult[];
}

export class MaintenanceController {
  async getReminders(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const tenantContext = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isSuperAdmin,
        authContext.orgUnitId
      );

      const searchParams = req.nextUrl.searchParams;

      const statusParam = searchParams.get('status');
      const priorityParam = searchParams.get('priority');
      const categoryParam = searchParams.get('category');

      const filters: MaintenanceFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        status:
          statusParam && statusParam !== 'all' ? (statusParam as any) : undefined,
        priority:
          priorityParam && priorityParam !== 'all' ? (priorityParam as any) : undefined,
        category:
          categoryParam && categoryParam !== 'all' ? categoryParam : undefined,
        assigned_to: searchParams.get('assigned_to') || undefined,
        startDate: searchParams.get('start')
          ? new Date(searchParams.get('start')!)
          : undefined,
        endDate: searchParams.get('end')
          ? new Date(searchParams.get('end')!)
          : undefined,
      };

      const pageParam = searchParams.get('page');
      if (!pageParam) {
        // Legacy non-paginated path used by dashboards/charts
        const result = await maintenanceRepository.getFilteredRemindersInScope(
          filters,
          tenantContext,
          { page: 1, limit: 10000 }
        );
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(
        pageParam,
        searchParams.get('limit')
      );

      const result = await maintenanceRepository.getFilteredRemindersInScope(
        filters,
        tenantContext,
        { page, limit }
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (critical -- org-unit scope bypass on single-record access):
   * same bug/fix as VehicleController.loadInScopeVehicle -- getReminders
   * (list) was the only endpoint applying org-unit scoping;
   * getReminder/updateReminder/deleteReminder/completeReminder checked
   * only tenantId (or, for delete, nothing at all beyond tenantId via
   * the command handler).
   */
  private async loadInScopeReminder(req: NextRequest, id: string) {
    const authContext = await getAuthContext(req);
    if (!authContext) {
      throw new UnauthorizedError('Authentication required');
    }

    const reminder = await maintenanceQueryService.getReminderById(id, authContext.tenantId);

    const tenantContext = await tenantContextService.resolveContext(
      authContext.userId,
      authContext.tenantId,
      authContext.roles,
      authContext.isSuperAdmin,
      authContext.orgUnitId
    );

    const reminderOrgUnitId = (reminder as any).orgUnitId as string | undefined;
    if (
      reminderOrgUnitId &&
      !tenantScopeService.canAccessOrgUnit(tenantContext, reminderOrgUnitId)
    ) {
      throw new NotFoundError('Reminder not found');
    }

    return { authContext, reminder };
  }

  async getReminder(req: NextRequest, id: string) {
    try {
      const { reminder } = await this.loadInScopeReminder(req, id);
      return successResponse(reminder);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createReminder(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const reminder = await maintenanceCommandService.createReminder(body, tenantId, userId);
      return createdResponse(reminder);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateReminder(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeReminder(req, id);
      const userId = authContext.userId;
      const body = await req.json();

      const reminder = await maintenanceCommandService.updateReminder(id, body, authContext.tenantId, userId);
      return successResponse(reminder);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async completeReminder(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeReminder(req, id);
      const userId = authContext.userId;
      const body = await req.json().catch(() => ({}));

      const completionDate = body?.completion_date
        ? new Date(body.completion_date)
        : undefined;

      const reminder = await maintenanceCommandService.completeReminder(
        id,
        authContext.tenantId,
        userId,
        completionDate
      );
      return successResponse(reminder);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteReminder(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeReminder(req, id);
      const userId = authContext.userId;

      await maintenanceCommandService.deleteReminder(id, authContext.tenantId, userId);
      return successResponse({ message: 'Reminder deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMaintenanceStats(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const stats = await maintenanceQueryService.getMaintenanceStats(tenantId);
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getOverdueReminders(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const reminders = await maintenanceQueryService.getOverdueReminders(tenantId);
      return successResponse(reminders);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getUpcomingReminders(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const daysAhead = Number(req.nextUrl.searchParams.get('daysAhead') || '7');
      const reminders = await maintenanceQueryService.getUpcomingReminders(tenantId, daysAhead);
      return successResponse(reminders);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Enterprise CSV import for maintenance reminders. Same pattern as
   * VehicleController.importVehicles/FuelController.importFuelLogs: every
   * row goes through maintenanceCommandService.createReminder -- the same
   * validation, tenant scoping, and ReminderCreatedEvent as a single
   * create. Sequential (not Promise.all) so per-row failures never abort
   * the batch; every row gets its own success/failure result.
   */
  async importReminders(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      let body: { records?: unknown };
      try {
        body = await req.json();
      } catch {
        throw new AppError('Invalid JSON body', 'INVALID_JSON', 400);
      }

      const records = Array.isArray(body.records) ? (body.records as Record<string, unknown>[]) : null;
      if (!records || records.length === 0) {
        throw new AppError('No records provided for import', 'NO_RECORDS', 400);
      }
      if (records.length > MAX_IMPORT_ROWS) {
        throw new AppError(`Import exceeds the maximum of ${MAX_IMPORT_ROWS} rows per batch`, 'IMPORT_TOO_LARGE', 400);
      }

      const results: ImportRowResult[] = [];
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < records.length; i++) {
        const rawRow = records[i];
        const rowNumber = i + 2;
        const licensePlate =
          typeof rawRow.license_plate === 'string' ? rawRow.license_plate.toUpperCase() : undefined;

        try {
          const reminder = await maintenanceCommandService.createReminder(rawRow, tenantId, userId);
          succeeded += 1;
          results.push({ row: rowNumber, success: true, identifier: reminder.title });
        } catch (error) {
          failed += 1;
          const message =
            error instanceof AppError ? error.message : 'Unexpected error while importing this row';
          results.push({ row: rowNumber, success: false, identifier: licensePlate, error: message });
        }
      }

      const response: ImportResponse = { summary: { total: records.length, succeeded, failed }, results };
      return successResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[MaintenanceController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const maintenanceController = new MaintenanceController();