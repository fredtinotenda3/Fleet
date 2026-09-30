// modules/expenses/controllers/expense-intelligence.controller.ts
//
// GET /api/expenses/monthly-intelligence-report -- the Monthly Expense
// Intelligence Report. Mirrors
// modules/fuel/controllers/fuel-intelligence.controller.ts's structure
// and scoping discipline exactly: resolve a full TenantContext from the
// request and thread it into the service, never accept a caller-supplied
// org/tenant id for the data itself.
//
// BACKEND-ONLY PHASE -- see monthly-expense-intelligence.service.ts's
// header and the delivery MANIFEST for the full context. Per the user's
// own chosen build sequencing (backend first, then PDF/Excel/UI as a
// separate, later delivery), this endpoint currently serves "json" only.
// "excel" and "pdf" are kept as RECOGNIZED, VALID format values -- not
// rejected as a bad request -- so that the query contract this endpoint
// exposes today does not have to change (a breaking change for any
// caller) once the Excel/PDF generators are actually built; they return
// a 501 Not Implemented with a clear message instead of a generic 400,
// so a caller/consumer can tell "this format doesn't exist yet" apart
// from "you asked for something invalid."

import { NextRequest } from 'next/server';
import { monthlyExpenseIntelligenceService } from '../reporting/monthly-expense-intelligence.service';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { isAppError, describeError, ValidationError, AppError } from '@/server/errors/app.errors';
import { getTenantFromRequest } from '@/server/utils/context.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';

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

      if (formatParam === 'excel' || formatParam === 'pdf') {
        throw new AppError(
          `The Expense Intelligence Report's "${formatParam}" export is not available yet -- only "json" is currently supported. Excel and PDF exports are planned as a follow-up delivery.`,
          'NOT_IMPLEMENTED',
          501
        );
      }

      const report = await monthlyExpenseIntelligenceService.buildReport(tenantId, context, monthParam);
      return successResponse(report);
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
