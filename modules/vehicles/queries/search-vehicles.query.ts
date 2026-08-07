// modules/vehicles/queries/search-vehicles.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { PaginationParams } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

export class SearchVehiclesQuery extends BaseQuery {
  static readonly queryName = 'SearchVehiclesQuery';

  constructor(
    public readonly searchTerm: string,
    public readonly pagination: PaginationParams,
    public readonly tenantId: string,
    /** Org-unit scope. Omitted only by platform tooling. */
    public readonly context?: TenantContext
  ) {
    super(SearchVehiclesQuery.queryName);
  }
}