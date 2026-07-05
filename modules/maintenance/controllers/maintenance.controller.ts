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
import { AppError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';

bootstrapCqrs();

export class MaintenanceController {
  async getReminders(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
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
        const result = await maintenanceQueryService.getFilteredReminders(
          filters,
          { page: 1, limit: 10000 },
          tenantId
        );
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(
        pageParam,
        searchParams.get('limit')
      );

      const result = await maintenanceQueryService.getFilteredReminders(
        filters,
        { page, limit },
        tenantId
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getReminder(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const reminder = await maintenanceQueryService.getReminderById(id, tenantId);
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
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const reminder = await maintenanceCommandService.updateReminder(id, body, tenantId, userId);
      return successResponse(reminder);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async completeReminder(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json().catch(() => ({}));

      const completionDate = body?.completion_date
        ? new Date(body.completion_date)
        : undefined;

      const reminder = await maintenanceCommandService.completeReminder(
        id,
        tenantId,
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
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      await maintenanceCommandService.deleteReminder(id, tenantId, userId);
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

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[MaintenanceController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const maintenanceController = new MaintenanceController();