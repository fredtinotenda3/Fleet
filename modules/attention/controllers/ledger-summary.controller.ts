// modules/attention/controllers/ledger-summary.controller.ts
//
// GET /api/attention/ledger/summary -- the value-ledger's month-to-date
// modelled/realised rollup, without the row-level entries the full
// /api/attention/ledger/export returns. Same request-parsing shape as
// ledger-export.controller.ts (resolveTenantContext(req), never a
// caller-supplied org/tenant id), gated behind Permission.FINANCE_VIEW
// instead of Permission.ANALYTICS_EXPORT -- see the route for the
// permission check itself, and modules/attention/services/
// ledger-export.service.ts's buildSummary() doc comment for why this
// exists as a separate read rather than just relaxing /export's gate.

import { NextRequest } from 'next/server';
import { ledgerExportService } from '../services/ledger-export.service';
import type { LedgerEligibleSource } from '../types/value-ledger.types';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { isAppError, describeError, ValidationError } from '@/server/errors/app.errors';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';

function isLedgerEligibleSource(value: string | null): value is LedgerEligibleSource {
  return value === 'fuel_fraud' || value === 'expense_anomaly';
}

function parseDateParam(value: string | null, paramName: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`Invalid "${paramName}" date: "${value}".`);
  }
  return parsed;
}

export class LedgerSummaryController {
  async getSummary(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);

      const searchParams = req.nextUrl.searchParams;
      const sourceParam = searchParams.get('source');
      let source: LedgerEligibleSource | undefined;
      if (sourceParam) {
        if (!isLedgerEligibleSource(sourceParam)) {
          throw new ValidationError(
            `Unsupported source "${sourceParam}". Use "fuel_fraud" or "expense_anomaly".`
          );
        }
        source = sourceParam;
      }

      const from = parseDateParam(searchParams.get('from'), 'from');
      const to = parseDateParam(searchParams.get('to'), 'to');

      const data = await ledgerExportService.buildSummary(context, { source, from, to });

      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }

    console.error('[LedgerSummaryController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const ledgerSummaryController = new LedgerSummaryController();
