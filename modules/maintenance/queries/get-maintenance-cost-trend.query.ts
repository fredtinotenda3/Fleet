import { BaseQuery } from '@/server/cqrs/query';

export class GetMaintenanceCostTrendQuery extends BaseQuery {
  static readonly queryName = 'GetMaintenanceCostTrendQuery';

  constructor(
    public readonly tenantId: string,
    public readonly months: number = 12
  ) {
    super(GetMaintenanceCostTrendQuery.queryName);
  }
}