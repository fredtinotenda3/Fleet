// modules/trips/queries/get-daily-distance.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetDailyDistanceQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly days: number = 30
  ) {
    super(GetDailyDistanceQuery.name);
  }
}