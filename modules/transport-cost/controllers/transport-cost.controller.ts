// modules/transport-cost/controllers/transport-cost.controller.ts
//
// Phase O1's HTTP boundary. Two import actions (one per sheet family --
// see the command file for why they are not merged into one endpoint
// with a body-supplied `sheetFamily`: a body field an importer could get
// wrong is worse than a URL that states it) and one read action for
// verifying an import landed correctly.

import { NextRequest, NextResponse } from 'next/server';
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { transportCostCommandService } from '../services/transport-cost-command.service';
import { transportCostQueryService } from '../services/transport-cost-query.service';
import { transportCostPostingService } from '../services/transport-cost-posting.service';
import { transportCostRecordCommandService } from '../services/transport-cost-record-command.service';
import { transportCostReportService, CommandCentreFilters, CommandCentreGranularity } from '../services/transport-cost-report.service';
import { buildDataQualityExceptionsCsv } from '../generators/data-quality-exceptions-csv.generator';
import { TransportCostImportRow } from '../commands/import-transport-cost.command';
import { TransportCostSheetFamily, TransportCostSourceRecordFilters } from '@/shared/types/transport-cost.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
import { ValidationError, ForbiddenError, isAppError, describeError } from '@/server/errors/app.errors';
import { resolveTenantContext, resolveTenantContextWithUser } from '@/server/utils/tenant-context.utils';
import { getAuthContext, hasPermission } from '@/server/auth/auth-context';
import { Permission } from '@/server/permissions/roles';
import { userWriteScope } from '@/server/tenancy/write-scope';
import { applySecurityHeaders } from '@/infrastructure/security/security-headers';

bootstrapCqrs();

const MAX_IMPORT_ROWS = 5000;

export class TransportCostController {
  private async handleImport(req: NextRequest, sheetFamily: TransportCostSheetFamily) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await req.json();
      const rows = (body as any)?.rows as TransportCostImportRow[] | undefined;
      const sourceFileName = (body as any)?.sourceFileName;
      const periodMonth = (body as any)?.periodMonth as string | undefined;

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
      // Vansales periodization Option A -- the handler re-validates this
      // authoritatively (every ImportTransportCostCommand caller, not
      // just this HTTP route, must go through it), but failing fast here
      // with a field-specific message is better UX than a generic 400
      // from deeper in the CQRS stack.
      if (sheetFamily === 'vansales' && (typeof periodMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth))) {
        throw new ValidationError('periodMonth ("YYYY-MM") is required for a Vansales import. See VANSALES_PERIODIZATION_DECISION.md.');
      }

      const result = await transportCostCommandService.importTransportCost(
        sheetFamily,
        rows,
        userWriteScope(context),
        sourceFileName.trim(),
        userId,
        periodMonth
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

  /** POST /api/transport-cost/import/swift */
  async importSwift(req: NextRequest) {
    return this.handleImport(req, 'swift');
  }

  /** POST /api/transport-cost/import/depot-sto */
  async importDepotSto(req: NextRequest) {
    return this.handleImport(req, 'depot-sto');
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

  /**
   * GET /api/transport-cost/report/exceptions?periodStart=...&periodEnd=...&format=json|csv
   *
   * Item 6: "a data-quality exceptions export ... so the four
   * year-typo rows and the rejected rows are findable without reading
   * the README." Same VIEW-gated, period-required convention as
   * getAllocationReport above; `format=csv` mirrors
   * modules/attention/controllers/ledger-export.controller.ts's
   * ?format= pattern.
   */
  async getDataQualityExceptions(req: NextRequest) {
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

      const format = params.get('format') ?? 'json';
      if (format !== 'json' && format !== 'csv') {
        throw new ValidationError(`Unsupported export format "${format}". Use "json" or "csv".`);
      }

      const result = await transportCostReportService.getDataQualityExceptions(context, start, end);

      if (format === 'json') {
        return successResponse(result);
      }

      const buffer = buildDataQualityExceptionsCsv(result);
      const filename = `transport-cost-data-quality-exceptions-${periodStart}-${periodEnd}.csv`;
      const response = new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
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

  /**
   * GET /api/transport-cost/command-centre/summary -- Command Centre
   * Slice A/B/C. ONE response for the whole dashboard (see
   * TransportCostReportService.getCommandCentreSummary's own header for
   * why) -- read-only, VIEW-gated exactly like getAllocationReport
   * above (route wires Permission.TRANSPORT_COST_VIEW, not a manage-
   * level permission: reading the summary carries no write authority).
   *
   * Query params:
   *   periodStart, periodEnd (required, ISO)
   *   granularity: 'day' | 'week' | 'month' (required)
   *   costFacingCompany, costCategory, vehicleId, transporterPartnerId,
   *   destinationTown, customerName (all optional filters)
   *
   * Every filter is passed through as-is; the SERVICE validates
   * costCategory membership and the date range, not this boundary --
   * same "validation lives with the business rule it enforces, not
   * duplicated at the HTTP edge" convention as every other read here.
   */
  async getCommandCentreSummary(req: NextRequest) {
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

      const granularityParam = params.get('granularity');
      if (granularityParam !== 'day' && granularityParam !== 'week' && granularityParam !== 'month') {
        throw new ValidationError('"granularity" must be one of "day", "week", "month".');
      }
      const granularity = granularityParam as CommandCentreGranularity;

      const filters: CommandCentreFilters = {
        costFacingCompany: (params.get('costFacingCompany') as CommandCentreFilters['costFacingCompany']) || undefined,
        costCategory: (params.get('costCategory') as CommandCentreFilters['costCategory']) || undefined,
        vehicleId: params.get('vehicleId') || undefined,
        transporterPartnerId: params.get('transporterPartnerId') || undefined,
        destinationTown: params.get('destinationTown') || undefined,
        customerName: params.get('customerName') || undefined,
      };

      const result = await transportCostReportService.getCommandCentreSummary(context, start, end, granularity, filters);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ---------------------------------------------------------------------
  // OLIVINE LIVE OPERATING MODEL, SLICE 5 -- operational-record CRUD,
  // review-adjacent correction/cancellation/duplication. See
  // OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md Section 8 for the full
  // design record. Every method below delegates to
  // TransportCostRecordCommandService, which itself reuses
  // AllocationService.reversePosting() and
  // TransportCostPostingService.postSourceRecord() rather than
  // reimplementing correction/reversal logic -- see that service's own
  // header.
  // ---------------------------------------------------------------------

  /** GET /api/transport-cost/source-records/[id] -- operational detail
   *  view: the source record, its derived lifecycle status, and its
   *  full ledger posting history (original/reversal/current, exactly as
   *  AllocationLedgerRepository.findBySource returns it -- never
   *  recomputed or summarized here). Read-only, VIEW-gated. */
  /** GET /api/transport-cost/source-records/statuses?ids=a,b,c -- Slice 5.
   *  Bulk lifecycle status for the operational table's status column;
   *  see TransportCostRecordCommandService.getOperationalStatusesForIds
   *  for why this is capped-batch and tenant/org-unit scope-checked per
   *  id rather than a raw findById loop. GET (not POST) since this is a
   *  pure read with no side effect, matching every other list/search
   *  endpoint in this controller. */
  async getSourceRecordStatuses(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const idsParam = req.nextUrl.searchParams.get('ids') ?? '';
      const ids = idsParam
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      if (ids.length === 0) {
        return successResponse({});
      }
      if (ids.length > 200) {
        throw new ValidationError('At most 200 ids may be requested at once.');
      }
      const result = await transportCostRecordCommandService.getOperationalStatusesForIds(context, ids);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getOperationalRecord(req: NextRequest, sourceRecordId: string) {
    try {
      const context = await resolveTenantContext(req);
      const result = await transportCostRecordCommandService.getOperationalStatus(context, sourceRecordId);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** PATCH /api/transport-cost/source-records/[id] -- Edit. Non-financial
   *  fields on any non-cancelled record, or any field on a record that
   *  has never been posted. Financial-field edits on a POSTED record are
   *  refused (see TransportCostRecordCommandService.editSourceRecord) --
   *  use the Correct action instead. NORMALIZE-gated: this action can
   *  never itself trigger a ledger reversal or posting. */
  async editSourceRecord(req: NextRequest, sourceRecordId: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const patch = await req.json();
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new ValidationError('Request body must be an object of fields to edit.');
      }
      const result = await transportCostRecordCommandService.editSourceRecord(context, userId, sourceRecordId, patch);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/source-records/[id]/correct -- Correct.
   *  The only way to change a financial field on a POSTED record:
   *  applies the patch, then re-runs postSourceRecord(), which performs
   *  the existing reverse-then-repost sequence. FINANCE_MANAGE-gated --
   *  the same privilege boundary the existing /postings routes already
   *  use, since this action can always result in a ledger write. */
  async correctPostedSourceRecord(req: NextRequest, sourceRecordId: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const patch = await req.json();
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new ValidationError('Request body must be an object of fields to correct.');
      }
      const result = await transportCostRecordCommandService.correctPostedSourceRecord(
        context,
        userId,
        sourceRecordId,
        patch
      );
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/source-records/[id]/cancel -- Cancel. Body:
   *  { reason }. Route is wired at the lower NORMALIZE privilege level
   *  (cancelling an unposted mistake is routine operational cleanup),
   *  but a cancel that would reverse an ALREADY-POSTED record's ledger
   *  entry is a financial action and requires FINANCE_MANAGE as well --
   *  checked here, in the handler, once the record's actual state is
   *  known (the route wrapper alone cannot know this before reading the
   *  record). Least-privilege: entering/cancelling a record is not the
   *  same authority as reversing a financial posting. */
  async cancelSourceRecord(req: NextRequest, sourceRecordId: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await req.json();
      const reason = (body as any)?.reason;
      if (typeof reason !== 'string' || !reason.trim()) {
        throw new ValidationError('reason is required to cancel a record');
      }

      const view = await transportCostRecordCommandService.getOperationalStatus(context, sourceRecordId);
      if (view.status === 'posted') {
        const authContext = await getAuthContext(req);
        if (!authContext || !hasPermission(authContext, Permission.FINANCE_MANAGE)) {
          throw new ForbiddenError(
            'Cancelling an already-posted record reverses its ledger entry and requires finance-management permission.'
          );
        }
      }

      const result = await transportCostRecordCommandService.cancelSourceRecord(
        context,
        userId,
        sourceRecordId,
        reason.trim()
      );
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/source-records/[id]/duplicate -- Duplicate.
   *  Creates a new, unposted record copying the original's editable
   *  fields; never copies a confirmed vehicle/transporter identity or
   *  links to the original's ledger posting. NORMALIZE-gated -- creates
   *  an operational record, never a ledger write. */
  async duplicateSourceRecord(req: NextRequest, sourceRecordId: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const result = await transportCostRecordCommandService.duplicateSourceRecord(context, userId, sourceRecordId);
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
