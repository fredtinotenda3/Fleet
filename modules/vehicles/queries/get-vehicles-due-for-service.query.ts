// modules/vehicles/queries/get-vehicles-due-for-service.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehiclesDueForServiceQuery extends BaseQuery {
  constructor(
    public readonly mileageThreshold: number,
    public readonly tenantId: string
  ) {
    super(GetVehiclesDueForServiceQuery.name);
  }
}