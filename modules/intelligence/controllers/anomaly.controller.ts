// modules/intelligence/controllers/anomaly.controller.ts
//
// ASSUMPTION: uses `requireAuthContext(req)` from server/auth/auth-context.ts
// to resolve { tenantId, userId } from the authenticated request, matching
// the naming convention of that file. If this module's actual exported
// helper has a different name/signature, swap the import below --
// everything else in this controller is independent of that detail.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthContext } from '@/server/auth/auth-context';
import { anomalyRepository } from '../repositories/anomaly.repository';
import { anomalyListQuerySchema, anomalyStatusUpdateSchema } from '@/shared/validations/anomaly.schema';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { handleError } from '@/server/utils/error-handler';
import { successResponse } from '@/server/utils/response.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import '@/shared/types/anomaly.tenancy-addendum';

export class AnomalyController {
  async list(req: NextRequest): Promise<NextResponse> {
    try {
      const context = await resolveTenantContext(req);
      const url = new URL(req.url);
      const parsed = anomalyListQuerySchema.safeParse(Object.fromEntries(url.searchParams));

      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.flatten());
      }

      const { page, limit, ...filters } = parsed.data;
      const result = await anomalyRepository.getFilteredInScope(filters, context, { page, limit });

      return successResponse(result);
    } catch (error) {
      return handleError(error);
    }
  }

  async getById(req: NextRequest, id: string): Promise<NextResponse> {
    try {
      const context = await resolveTenantContext(req);
      const anomaly = await anomalyRepository.findById(id, context.organizationId);
      if (!anomaly) throw new NotFoundError('Anomaly not found');
      // An anomaly names its vehicle (licensePlate) in the payload, so an
      // out-of-scope read discloses the vehicle too. 404, not 403 --
      // a 403 confirms the id is real.
      if (
        context.accessibleOrgUnitIds !== null &&
        (!anomaly.orgUnitId || !context.accessibleOrgUnitIds.includes(anomaly.orgUnitId))
      ) {
        throw new NotFoundError('Anomaly not found');
      }
      return successResponse(anomaly);
    } catch (error) {
      return handleError(error);
    }
  }

  async updateStatus(req: NextRequest, id: string): Promise<NextResponse> {
    try {
      const { userId } = await requireAuthContext(req);
      const context = await resolveTenantContext(req);
      const body = await req.json();
      const parsed = anomalyStatusUpdateSchema.safeParse(body);

      if (!parsed.success) {
        throw new ValidationError('Invalid status update', parsed.error.flatten());
      }

      const existing = await anomalyRepository.findById(id, context.organizationId);
      if (!existing) throw new NotFoundError('Anomaly not found');
      if (
        context.accessibleOrgUnitIds !== null &&
        (!existing.orgUnitId || !context.accessibleOrgUnitIds.includes(existing.orgUnitId))
      ) {
        throw new NotFoundError('Anomaly not found');
      }

      const updated = await anomalyRepository.updateStatus(id, context.organizationId, parsed.data.status, userId);
      if (!updated) throw new NotFoundError('Anomaly not found');

      return successResponse(updated);
    } catch (error) {
      return handleError(error);
    }
  }

  async summary(req: NextRequest): Promise<NextResponse> {
    try {
      // Aggregate, scoped. See countOpenBySeverityInScope for why an
      // unscoped aggregate is still a disclosure.
      const context = await resolveTenantContext(req);
      const counts = await anomalyRepository.countOpenBySeverityInScope(context);
      return successResponse(counts);
    } catch (error) {
      return handleError(error);
    }
  }
}

export const anomalyController = new AnomalyController();