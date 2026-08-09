// modules/esg/controllers/esg.controller.ts
//
// GET /api/esg/export -- the Insurance/ESG data-sharing export.
//
// Scoping follows the same pattern as every other export path audited
// in tests/security/export-scope-conformance.spec.ts: resolve a full
// TenantContext from the request and thread it into the service,
// never accept a caller-supplied org/tenant id for the data itself.
// See tests/security/esg-export-scope.spec.ts for the structural test
// covering this file specifically (esgExportService.buildExport is
// never called with only a tenantId).

import { NextRequest, NextResponse } from 'next/server';
import { esgExportService } from '../services/esg-export.service';
import { buildEsgPdfBuffer } from '../generators/esg-pdf.generator';
import type { EsgExportFormat } from '../types/esg-export.types';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, isAppError, describeError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest } from '@/server/utils/context.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { applySecurityHeaders } from '@/infrastructure/security/security-headers';

function isEsgFormat(value: string | null): value is EsgExportFormat {
  return value === 'json' || value === 'pdf';
}

export class EsgController {
  async exportData(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const context = await resolveTenantContext(req);

      const searchParams = req.nextUrl.searchParams;
      const formatParam = searchParams.get('format') ?? 'json';
      if (!isEsgFormat(formatParam)) {
        throw new ValidationError(`Unsupported export format "${formatParam}". Use "json" or "pdf".`);
      }
      const includeDriverNames = searchParams.get('includeDriverNames') === 'true';

      const data = await esgExportService.buildExport(tenantId, context, {
        format: formatParam,
        includeDriverNames,
      });

      if (formatParam === 'json') {
        return successResponse(data);
      }

      const buffer = await buildEsgPdfBuffer(data);
      const filename = `esg-export-${new Date().toISOString().slice(0, 10)}.pdf`;
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

    console.error('[EsgController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const esgController = new EsgController();
