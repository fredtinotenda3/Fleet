// modules/attention/controllers/ledger-export.controller.ts
//
// GET /api/attention/ledger/export -- the value-ledger report (JSON/PDF).
//
// Mirrors modules/esg/controllers/esg.controller.ts, including the
// scoping discipline every export path in this codebase follows (see
// tests/security/export-scope-conformance.spec.ts's header): resolve a
// full TenantContext from the request and thread it into the service,
// never accept a caller-supplied org/tenant id for the data itself. See
// tests/security/ledger-export-scope.spec.ts for the structural test
// covering this file specifically.

import { NextRequest, NextResponse } from 'next/server';
import { ledgerExportService } from '../services/ledger-export.service';
import { buildLedgerPdfBuffer } from '../generators/ledger-pdf.generator';
import type { LedgerExportFormat } from '../types/ledger-export.types';
import type { LedgerEligibleSource } from '../types/value-ledger.types';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, isAppError, describeError, ValidationError } from '@/server/errors/app.errors';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { applySecurityHeaders } from '@/infrastructure/security/security-headers';

function isLedgerExportFormat(value: string | null): value is LedgerExportFormat {
  return value === 'json' || value === 'pdf';
}

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

export class LedgerExportController {
  async exportLedger(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);

      const searchParams = req.nextUrl.searchParams;
      const formatParam = searchParams.get('format') ?? 'json';
      if (!isLedgerExportFormat(formatParam)) {
        throw new ValidationError(`Unsupported export format "${formatParam}". Use "json" or "pdf".`);
      }

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

      const data = await ledgerExportService.buildExport(context, {
        format: formatParam,
        source,
        from,
        to,
      });

      if (formatParam === 'json') {
        return successResponse(data);
      }

      const buffer = await buildLedgerPdfBuffer(data);
      const filename = `value-ledger-export-${new Date().toISOString().slice(0, 10)}.pdf`;
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

    console.error('[LedgerExportController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const ledgerExportController = new LedgerExportController();
