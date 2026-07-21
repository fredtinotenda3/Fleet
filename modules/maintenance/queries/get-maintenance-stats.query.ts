// modules/maintenance/queries/get-maintenance-stats.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetMaintenanceStatsQuery extends BaseQuery {
  static readonly queryName = 'GetMaintenanceStatsQuery';

  constructor(public readonly tenantId: string) {
    super(GetMaintenanceStatsQuery.queryName);
  }
}