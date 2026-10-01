// modules/expenses/controllers/expense-intelligence.controller.ts
//
// GET /api/expenses/monthly-intelligence-report -- the Monthly Expense
// Intelligence Report. Mirrors
// modules/fuel/controllers/fuel-intelligence.controller.ts's structure
// and scoping discipline exactly: resolve a full TenantContext from the
// request and thread it into the service, never accept a caller-supplied
// org/tenant id for the data itself.
//
// Serves all three formats ("json", "excel", "pdf"), same as the fuel
// report's controller -- the Excel and PDF generators
// (expense-intelligence-excel.generator.ts, expense-intelligence-pdf.generator.ts)
// are built to the same discipline as the fuel report's own generators.

import { NextRequest, NextResponse } from 'next/server';
import { monthlyExpenseIntelligenceService } from '../reporting/monthly-expense-intelligence.service';
import { buildExpenseIntelligenceExcelBuffer } from '../reporting/expense-intelligence-excel.generator';
import { buildExpenseIntelligencePdfBuffer } from '../reporting/expense-intelligence-pdf.generator';
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

export class ExpenseIntelligenceController {
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

      const report = await monthlyExpenseIntelligenceService.buildReport(tenantId, context, monthParam);

      if (formatParam === 'json') {
        return successResponse(report);
      }

      if (formatParam === 'excel') {
        const buffer = await buildExpenseIntelligenceExcelBuffer(report);
        const filename = `expense-intelligence-report-${monthParam}.xlsx`;
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
      const buffer = await buildExpenseIntelligencePdfBuffer(report);
      const filename = `expense-intelligence-report-${monthParam}.pdf`;
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
    console.error('[ExpenseIntelligenceController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const expenseIntelligenceController = new ExpenseIntelligenceController();
