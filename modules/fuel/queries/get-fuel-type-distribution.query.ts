import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelTypeDistributionQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelTypeDistributionQuery.name);
  }
}