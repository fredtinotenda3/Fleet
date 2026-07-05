// modules/reports/controllers/report.controller.ts

import { NextRequest, NextResponse } from 'next/server';
import { reportService } from '../services/report.service';
import { reportConfigSchema } from '@/shared/validations/report.schema';
import {
  successResponse,
  createdResponse,
  errorResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';

export class ReportController {
  async createReport(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = reportConfigSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid report configuration', parsed.error.flatten());
      }

      const report = await reportService.generateReport(parsed.data, tenantId, userId);
      return createdResponse(report);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listReports(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      const reports = await reportService.listReports(userId, tenantId);
      return successResponse(reports);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getReport(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const report = await reportService.getReport(id, tenantId);
      return successResponse(report);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async downloadReport(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      const { buffer, report } = await reportService.downloadReport(id, userId, tenantId);

      const extension = report.format === 'excel' ? 'xlsx' : report.format;
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        csv: 'text/csv',
        excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };

      // Convert Buffer to Uint8Array for NextResponse compatibility
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': mimeTypes[report.format],
          'Content-Disposition': `attachment; filename="${report.name}.${extension}"`,
          'Content-Length': buffer.length.toString(),
        },
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async scheduleReport(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = reportConfigSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid report configuration', parsed.error.flatten());
      }
      if (!parsed.data.schedule?.enabled) {
        throw new ValidationError('schedule.enabled must be true to schedule a report');
      }

      await reportService.scheduleReport(parsed.data, tenantId, userId);
      return successResponse({ message: 'Report scheduled successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ReportController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const reportController = new ReportController();