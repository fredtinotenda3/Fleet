// modules/vehicles/queries/get-vehicle-by-license-plate.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehicleByLicensePlateQuery extends BaseQuery {
  static readonly queryName = 'GetVehicleByLicensePlateQuery';

  constructor(
    public readonly licensePlate: string,
    public readonly tenantId: string
  ) {
    super(GetVehicleByLicensePlateQuery.queryName);
  }
}