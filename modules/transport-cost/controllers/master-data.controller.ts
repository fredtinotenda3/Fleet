// modules/transport-cost/controllers/master-data.controller.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. Thin HTTP boundary for
// MasterDataService, following transport-cost.controller.ts's own
// conventions exactly: resolveTenantContext(WithUser) -> service call ->
// successResponse/paginatedResponse, private handleError catching
// AppError subclasses. See master-data.service.ts's header for why
// Transporter/Vehicle only get a search method here, never a create one.
//
// Tenancy note: every method below passes `context.organizationId` as
// the `tenantId` argument into MasterDataService -- the same value every
// other transport-cost controller method already uses this way (see
// e.g. listNormalizationReviewQueue in transport-cost.controller.ts).
// Customer/Destination/TransportPartner/ContractedVehicle are all
// organization-level collections (no orgUnitId), so this is the correct
// scope, not a narrowing mistake -- see customer.types.ts/destination
// .types.ts's headers.

import { NextRequest } from 'next/server';
import { masterDataService } from '../services/master-data.service';
import { successResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
import { ValidationError, isAppError, describeError } from '@/server/errors/app.errors';
import { resolveTenantContext, resolveTenantContextWithUser } from '@/server/utils/tenant-context.utils';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';

const MAX_NAME_LENGTH = 200;

function readSearchQuery(req: NextRequest): string {
  // Deliberately permits an empty "q" -- an empty query is a valid,
  // useful request (CustomerRepository.search's own doc comment: "opening
  // the dropdown with no typing yet still shows something to pick from").
  return req.nextUrl.searchParams.get('q')?.trim() ?? '';
}

function readCreateName(body: unknown, entityLabel: string): string {
  const raw = (body as Record<string, unknown> | null)?.name;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ValidationError(`A ${entityLabel} name is required.`);
  }
  if (raw.trim().length > MAX_NAME_LENGTH) {
    throw new ValidationError(`A ${entityLabel} name cannot exceed ${MAX_NAME_LENGTH} characters.`);
  }
  return raw.trim();
}

export class MasterDataController {
  // ── Customer ──────────────────────────────────────────────────────

  /** GET /api/transport-cost/customers/search?q=... */
  async searchCustomers(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const results = await masterDataService.searchCustomers(readSearchQuery(req), context.organizationId);
      return successResponse(results);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/customers  Body: { name }. Find-or-create. */
  async createCustomer(req: NextRequest) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await req.json().catch(() => ({}));
      const name = readCreateName(body, 'customer');
      const result = await masterDataService.createCustomer(name, context.organizationId, userId);
      return successResponse({ id: result.record._id, name: result.record.name, created: result.created });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** GET /api/transport-cost/customers?page=&limit=&activeOnly= -- simple management listing. */
  async listCustomers(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const params = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(params.get('page'), params.get('limit'));
      const activeOnly = params.get('activeOnly') === 'true';
      const result = await masterDataService.listCustomers(context.organizationId, { page, limit }, activeOnly);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/customers/[id]/deactivate */
  async deactivateCustomer(req: NextRequest, id: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const updated = await masterDataService.deactivateCustomer(id, context.organizationId, userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/customers/[id]/reactivate */
  async reactivateCustomer(req: NextRequest, id: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const updated = await masterDataService.reactivateCustomer(id, context.organizationId, userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ── Destination ───────────────────────────────────────────────────

  /** GET /api/transport-cost/destinations/search?q=... */
  async searchDestinations(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const results = await masterDataService.searchDestinations(readSearchQuery(req), context.organizationId);
      return successResponse(results);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/destinations  Body: { name }. Find-or-create. */
  async createDestination(req: NextRequest) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await req.json().catch(() => ({}));
      const name = readCreateName(body, 'destination');
      const result = await masterDataService.createDestination(name, context.organizationId, userId);
      return successResponse({ id: result.record._id, name: result.record.name, created: result.created });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** GET /api/transport-cost/destinations?page=&limit=&activeOnly= -- simple management listing. */
  async listDestinations(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const params = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(params.get('page'), params.get('limit'));
      const activeOnly = params.get('activeOnly') === 'true';
      const result = await masterDataService.listDestinations(context.organizationId, { page, limit }, activeOnly);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/destinations/[id]/deactivate */
  async deactivateDestination(req: NextRequest, id: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const updated = await masterDataService.deactivateDestination(id, context.organizationId, userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/transport-cost/destinations/[id]/reactivate */
  async reactivateDestination(req: NextRequest, id: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const updated = await masterDataService.reactivateDestination(id, context.organizationId, userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ── Transporter / Vehicle (search only) ─────────────────────────────

  /** GET /api/transport-cost/transporters/search?q=... -- confirmed TransportPartner rows only. */
  async searchTransporters(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const results = await masterDataService.searchTransporters(readSearchQuery(req), context.organizationId);
      return successResponse(results);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** GET /api/transport-cost/vehicles/search?q=&transporterPartnerId=... -- confirmed ContractedVehicle rows only. */
  async searchVehicles(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const transporterPartnerId = req.nextUrl.searchParams.get('transporterPartnerId')?.trim() || undefined;
      const results = await masterDataService.searchVehicles(
        readSearchQuery(req),
        context.organizationId,
        transporterPartnerId
      );
      return successResponse(results);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[MasterDataController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const masterDataController = new MasterDataController();
