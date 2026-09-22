// modules/transport-cost/controllers/transport-cost.controller.ts
//
// Phase O1's HTTP boundary. Two import actions (one per sheet family --
// see the command file for why they are not merged into one endpoint
// with a body-supplied `sheetFamily`: a body field an importer could get
// wrong is worse than a URL that states it) and one read action for
// verifying an import landed correctly.

import { NextRequest } from 'next/server';
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { transportCostCommandService } from '../services/transport-cost-command.service';
import { transportCostQueryService } from '../services/transport-cost-query.service';
import { transportCostPostingService } from '../services/transport-cost-posting.service';
import { transportCostReportService } from '../services/transport-cost-report.service';
import { TransportCostImportRow } from '../commands/import-transport-cost.command';
import { TransportCostSheetFamily, TransportCostSourceRecordFilters } from '@/shared/types/transport-cost.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
import { ValidationError, isAppError, describeError } from '@/server/errors/app.errors';
import { resolveTenantContext, resolveTenantContextWithUser } from '@/server/utils/tenant-context.utils';
import { userWriteScope } from '@/server/tenancy/write-scope';

bootstrapCqrs();

const MAX_IMPORT_ROWS = 5000;

export class TransportCostController {
  private async handleImport(req: NextRequest, sheetFamily: TransportCostSheetFamily) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await req.json();
      const rows = (body as any)?.rows as TransportCostImportRow[] | undefined;
      const sourceFileName = (body as any)?.sourceFileName;

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new ValidationError('No rows to import');
      }
      if (rows.length > MAX_IMPORT_ROWS) {
        throw new ValidationError(
          `This file has ${rows.length} rows, which exceeds the ${MAX_IMPORT_ROWS}-row limit per import. Split it into smaller batches.`
        );
      }
      if (typeof sourceFileName !== 'string' || !sourceFileName.trim()) {
        throw new ValidationError('sourceFileName is required');
      }

      const result = await transportCostCommandService.importTransportCost(
        sheetFamily,
        rows,
        userWriteScope(context),
        sourceFileName.trim(),
        userId
      );
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/import/third-party */
  async importThirdParty(req: NextRequest) {
    return this.handleImport(req, 'third-party');
  }

  /** POST /api/transport-cost/import/vansales */
  async importVansales(req: NextRequest) {
    return this.handleImport(req, 'vansales');
  }

  /**
   * GET /api/transport-cost/source-records
   *
   * Verification/review listing only, per Phase O1 scope -- no totals, no
   * cost aggregation. See the query's own header comment.
   */
  async getSourceRecords(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const searchParams = req.nextUrl.searchParams;

      const filters: TransportCostSourceRecordFilters = {
        sheetFamily: (searchParams.get('sheetFamily') as TransportCostSourceRecordFilters['sheetFamily']) || undefined,
        importBatchId: searchParams.get('importBatchId') || undefined,
        registration: searchParams.get('registration') || undefined,
        startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
        endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
      };

      const { page, limit } = validatePaginationParams(
        searchParams.get('page'),
        searchParams.get('limit')
      );

      const result = await transportCostQueryService.getSourceRecords(filters, { page, limit }, context);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** GET /api/transport-cost/normalization-review -- Phase O2. */
  async listNormalizationReviewQueue(req: NextRequest) {
    try {
      const { context } = await resolveTenantContextWithUser(req);
      const searchParams = req.nextUrl.searchParams;
      const kindParam = searchParams.get('kind');
      if (kindParam && kindParam !== 'transporter' && kindParam !== 'vehicle') {
        throw new ValidationError("kind must be 'transporter' or 'vehicle' when provided");
      }
      const { page, limit } = validatePaginationParams(searchParams.get('page'), searchParams.get('limit'));

      const result = await transportCostQueryService.listNormalizationReviewQueue(
        context.organizationId,
        { page, limit },
        (kindParam as 'transporter' | 'vehicle' | null) ?? undefined
      );
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/normalization-review/[id]/confirm-match -- Phase O2. */
  async confirmReviewMatch(req: NextRequest, reviewItemId: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await req.json();
      const resolvedEntityId = (body as any)?.resolvedEntityId;
      if (typeof resolvedEntityId !== 'string' || !resolvedEntityId.trim()) {
        throw new ValidationError('resolvedEntityId is required');
      }

      const result = await transportCostCommandService.confirmReviewMatch(
        reviewItemId,
        resolvedEntityId.trim(),
        context.organizationId,
        userId
      );
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/normalization-review/[id]/confirm-new -- Phase O2. */
  async confirmReviewNew(req: NextRequest, reviewItemId: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await req.json().catch(() => ({}));
      const transporterPartnerId =
        typeof (body as any)?.transporterPartnerId === 'string' ? (body as any).transporterPartnerId : undefined;
      const businessStream =
        typeof (body as any)?.businessStream === 'string' ? (body as any).businessStream : undefined;

      const result = await transportCostCommandService.confirmReviewNew(
        reviewItemId,
        context.organizationId,
        userId,
        transporterPartnerId,
        businessStream
      );
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/normalization-review/[id]/reject -- Phase O2. */
  async rejectReviewItem(req: NextRequest, reviewItemId: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await req.json();
      const reason = (body as any)?.reason;
      if (typeof reason !== 'string' || !reason.trim()) {
        throw new ValidationError('reason is required to reject a review item');
      }

      const result = await transportCostCommandService.rejectReviewItem(
        reviewItemId,
        context.organizationId,
        userId,
        reason.trim()
      );
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/postings -- Phase O3. Body: { sourceRecordId }. */
  async postSourceRecord(req: NextRequest) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await req.json();
      const sourceRecordId = (body as any)?.sourceRecordId;
      if (typeof sourceRecordId !== 'string' || !sourceRecordId.trim()) {
        throw new ValidationError('sourceRecordId is required');
      }

      const result = await transportCostPostingService.postSourceRecord(context, userId, sourceRecordId.trim());
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/postings/batch -- Phase O3. Body: { importBatchId }. */
  async postImportBatch(req: NextRequest) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await req.json();
      const importBatchId = (body as any)?.importBatchId;
      if (typeof importBatchId !== 'string' || !importBatchId.trim()) {
        throw new ValidationError('importBatchId is required');
      }

      const result = await transportCostPostingService.postImportBatch(context, userId, importBatchId.trim());
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** GET /api/transport-cost/report?periodStart=...&periodEnd=... -- Phase O4. */
  async getAllocationReport(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const params = req.nextUrl.searchParams;

      const periodStart = params.get('periodStart');
      const periodEnd = params.get('periodEnd');
      if (!periodStart || !periodEnd) {
        throw new ValidationError('"periodStart" and "periodEnd" are required.');
      }
      const start = new Date(periodStart);
      const end = new Date(periodEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new ValidationError('"periodStart"/"periodEnd" must be valid dates.');
      }

      const result = await transportCostReportService.getAllocationReport(context, start, end);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** GET /api/transport-cost/report/months -- Phase O4: the month picker's own data source. */
  async getAvailableMonths(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const months = await transportCostReportService.getAvailableMonths(context);
      return successResponse(months);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** GET /api/transport-cost/report/vehicles/[id]?periodStart=...&periodEnd=... -- Phase O4 drill-down. */
  async getPostingsForVehicle(req: NextRequest, contractedVehicleId: string) {
    try {
      const context = await resolveTenantContext(req);
      const params = req.nextUrl.searchParams;

      const periodStart = params.get('periodStart');
      const periodEnd = params.get('periodEnd');
      if (!periodStart || !periodEnd) {
        throw new ValidationError('"periodStart" and "periodEnd" are required.');
      }
      const start = new Date(periodStart);
      const end = new Date(periodEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new ValidationError('"periodStart"/"periodEnd" must be valid dates.');
      }

      const result = await transportCostReportService.getPostingsForVehicle(context, contractedVehicleId, start, end);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[TransportCostController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const transportCostController = new TransportCostController();
