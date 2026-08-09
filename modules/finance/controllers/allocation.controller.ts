// modules/finance/controllers/allocation.controller.ts
//
// HTTP surface for the allocation ledger. Request-parsing only: parse,
// validate, resolve the tenant context, delegate. All business rules
// live in AllocationService, matching the convention documented in
// anomaly.controller.ts and attention-resolution.service.ts.
//
// Every handler resolves its own TenantContext from the request via
// resolveTenantContext() and never accepts a caller-supplied
// organization or org-unit id for the data itself -- the scoping
// discipline asserted structurally by
// tests/security/export-scope-conformance.spec.ts.

import { NextRequest } from 'next/server';
import { allocationService } from '../services/allocation.service';
import {
  createAllocationSchema,
  reverseAllocationSchema,
} from '@/shared/validations/finance.schema';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { isAppError, describeError, ValidationError } from '@/server/errors/app.errors';
import { resolveTenantContext, resolveTenantContextWithUser } from '@/server/utils/tenant-context.utils';

function parseDateParam(value: string | null, paramName: string, required: true): Date;
function parseDateParam(value: string | null, paramName: string, required?: false): Date | undefined;
function parseDateParam(value: string | null, paramName: string, required = false): Date | undefined {
  if (!value) {
    if (required) throw new ValidationError(`"${paramName}" is required.`);
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`Invalid "${paramName}" date: "${value}".`);
  }
  return parsed;
}

async function parseJsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON.');
  }
}

export class AllocationController {
  /** POST /api/finance/allocations */
  async createPosting(req: NextRequest) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await parseJsonBody(req);

      const result = await validateWithZod(createAllocationSchema, body);
      if (!result.success || !result.data) {
        throw new ValidationError('Validation failed', result.errors);
      }

      const posting = await allocationService.postAllocation(context, userId, result.data);
      return createdResponse(posting);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** GET /api/finance/allocations?vehicleId=...&periodStart=...&periodEnd=... */
  async listPostings(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const params = req.nextUrl.searchParams;

      const vehicleId = params.get('vehicleId');
      if (!vehicleId) {
        // Required rather than defaulting to the whole fleet: an
        // unbounded ledger read from a synchronous request is a DoS
        // surface independent of tenancy (the same reasoning behind
        // EXPORT_ROW_CAP on the value-ledger export).
        throw new ValidationError('"vehicleId" is required.');
      }

      const postings = await allocationService.listPostingsForVehicle(context, vehicleId, {
        periodStart: parseDateParam(params.get('periodStart'), 'periodStart'),
        periodEnd: parseDateParam(params.get('periodEnd'), 'periodEnd'),
      });

      return successResponse(postings, { count: postings.length });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/finance/allocations/:id/reverse */
  async reversePosting(req: NextRequest, postingId: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await parseJsonBody(req);

      const result = await validateWithZod(reverseAllocationSchema, body);
      if (!result.success || !result.data) {
        throw new ValidationError('Validation failed', result.errors);
      }

      const reversed = await allocationService.reversePosting(
        context,
        userId,
        postingId,
        result.data.reason
      );
      return createdResponse(reversed);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** GET /api/finance/cost-per-km?vehicleId=...&periodStart=...&periodEnd=... */
  async getCostPerKm(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const params = req.nextUrl.searchParams;

      const vehicleId = params.get('vehicleId');
      if (!vehicleId) {
        throw new ValidationError('"vehicleId" is required.');
      }

      const result = await allocationService.getCostPerKm(
        context,
        vehicleId,
        parseDateParam(params.get('periodStart'), 'periodStart', true),
        parseDateParam(params.get('periodEnd'), 'periodEnd', true)
      );

      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[AllocationController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const allocationController = new AllocationController();
