// modules/vehicles/queries/get-vehicle-analytics.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

export class GetVehicleAnalyticsQuery extends BaseQuery {
  static readonly queryName = 'GetVehicleAnalyticsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly startDate: Date,
    public readonly endDate: Date,
    /**
     * REQUIRED for org-unit scope. The repository method has always
     * accepted a context and applied `buildFilter` with it -- but the
     * CQRS path had no parameter for one, so `/api/vehicles/analytics`
     * called it with `undefined` and returned every vehicle in the
     * organisation, with its full operating cost, to a branch-scoped
     * caller whose own vehicle LIST is correctly narrowed.
     *
     * Optional in the type only so that genuinely org-wide internal
     * callers can pass nothing; every request-driven caller must pass
     * the resolved context.
     */
    public readonly context?: TenantContext
  ) {
    super(GetVehicleAnalyticsQuery.queryName);
  }
}