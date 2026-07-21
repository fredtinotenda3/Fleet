// modules/fuel/queries/get-fuel-logs.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { FuelFilters } from '@/shared/types/fuel.types';
import { PaginationParams } from '@/shared/types/common.types';

export class GetFuelLogsQuery extends BaseQuery {
  static readonly queryName = 'GetFuelLogsQuery';

  constructor(
    public readonly filters: FuelFilters,
    public readonly pagination: PaginationParams,
    public readonly tenantId: string
  ) {
    super(GetFuelLogsQuery.queryName);
  }
}