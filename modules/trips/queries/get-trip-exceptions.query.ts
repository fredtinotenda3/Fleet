// modules/trips/queries/get-trip-exceptions.query.ts

import { BaseQuery } from '@/server/cqrs/query';

/** VEHICLE-SCOPE ADDITION: optional licensePlate narrows exception
 *  detection to a single vehicle's trips. */
export class GetTripExceptionsQuery extends BaseQuery {
  static readonly queryName = 'GetTripExceptionsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly zThreshold: number = 2.5,
    public readonly limit: number = 50,
    public readonly licensePlate?: string
  ) {
    super(GetTripExceptionsQuery.queryName);
  }
}