// modules/vehicles/queries/get-vehicle-stats.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

export class GetVehicleStatsQuery extends BaseQuery {
  static readonly queryName = 'GetVehicleStatsQuery';

  /**
   * LEAK FIX: the query carried only a tenantId, so the CQRS path had no
   * way to express org-unit scope even though the repository beneath it
   * could. This drove the Vehicles page summary cards (Total fleet /
   * Active / In maintenance / Inactive) and the dashboard fleet-size and
   * live-map counts -- org-wide, above a correctly scoped table. Optional
   * so org-wide callers are unaffected.
   */
  constructor(
    public readonly tenantId: string,
    public readonly context?: TenantContext
  ) {
    super(GetVehicleStatsQuery.queryName);
  }
}