// modules/vehicles/queries/get-vehicles-due-for-service.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehiclesDueForServiceQuery extends BaseQuery {
  static readonly queryName = 'GetVehiclesDueForServiceQuery';

  constructor(
    public readonly mileageThreshold: number,
    public readonly tenantId: string
  ) {
    super(GetVehiclesDueForServiceQuery.queryName);
  }
}