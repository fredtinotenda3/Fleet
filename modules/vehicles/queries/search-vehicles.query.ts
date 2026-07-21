// modules/vehicles/queries/search-vehicles.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { PaginationParams } from '@/shared/types/common.types';

export class SearchVehiclesQuery extends BaseQuery {
  static readonly queryName = 'SearchVehiclesQuery';

  constructor(
    public readonly searchTerm: string,
    public readonly pagination: PaginationParams,
    public readonly tenantId: string
  ) {
    super(SearchVehiclesQuery.queryName);
  }
}