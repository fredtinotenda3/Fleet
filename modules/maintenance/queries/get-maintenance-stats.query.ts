// modules/maintenance/queries/get-maintenance-stats.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetMaintenanceStatsQuery extends BaseQuery {
  constructor(public readonly tenantId: string) {
    super(GetMaintenanceStatsQuery.name);
  }
}