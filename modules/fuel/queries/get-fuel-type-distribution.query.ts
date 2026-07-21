import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelTypeDistributionQuery extends BaseQuery {
  static readonly queryName = 'GetFuelTypeDistributionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelTypeDistributionQuery.queryName);
  }
}