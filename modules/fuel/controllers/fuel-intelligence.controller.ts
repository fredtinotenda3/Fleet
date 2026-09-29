// modules/fuel/controllers/fuel-intelligence.controller.ts
//
// GET /api/fuel/monthly-intelligence-report -- the Monthly Fuel & Fleet
// Intelligence Report (PART 5-8). Follows the exact scoping pattern
// documented in modules/esg/controllers/esg.controller.ts's header,
// which tests/security/esg-export-scope.spec.ts locks in: resolve a
// full TenantContext from the request and thread it into the service,
// never accept a caller-supplied org/tenant id for the data itself. See
// tests/security/fuel-intelligence-report-scope.spec.ts for the
// structural test covering this file specifically.

import { NextRequest, NextResponse } from 'next/server';
import { monthlyFuelIntelligenceService } from '../reporting/monthly-fuel-intelligence.service';
import { buildFuelIntelligenceExcelBuffer } from '../reporting/fuel-intelligence-excel.generator';
import { buildFuelIntelligencePdfBuffer } from '../reporting/fuel-intelligence-pdf.generator';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { isAppError, describeError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest } from '@/server/utils/context.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { applySecurityHeaders } from '@/infrastructure/security/security-headers';

type ReportFormat = 'json' | 'excel' | 'pdf';

function isReportFormat(value: string | null): value is ReportFormat {
  return value === 'json' || value === 'excel' || value === 'pdf';
}

function isValidMonth(value: string | null): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export class FuelIntelligenceController {
  async getMonthlyReport(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const context = await resolveTenantContext(req);

      const searchParams = req.nextUrl.searchParams;
      const formatParam = searchParams.get('format') ?? 'json';
      if (!isReportFormat(formatParam)) {
        throw new ValidationError(`Unsupported report format "${formatParam}". Use "json", "excel" or "pdf".`);
      }

      const monthParam = searchParams.get('month');
      if (!isValidMonth(monthParam)) {
        throw new ValidationError('A "month" query parameter in "YYYY-MM" format is required.');
      }

      const report = await monthlyFuelIntelligenceService.buildReport(tenantId, context, monthParam);

      if (formatParam === 'json') {
        return successResponse(report);
      }

      if (formatParam === 'excel') {
        const buffer = await buildFuelIntelligenceExcelBuffer(report);
        const filename = `fuel-intelligence-report-${monthParam}.xlsx`;
        const response = new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': String(buffer.length),
            'Cache-Control': 'no-store',
          },
        });
        return applySecurityHeaders(response);
      }

      // pdf
      const buffer = await buildFuelIntelligencePdfBuffer(report);
      const filename = `fuel-intelligence-report-${monthParam}.pdf`;
      const response = new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(buffer.length),
          'Cache-Control': 'no-store',
        },
      });
      return applySecurityHeaders(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[FuelIntelligenceController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const fuelIntelligenceController = new FuelIntelligenceController();
