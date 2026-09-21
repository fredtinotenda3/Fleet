// modules/transport-cost/queries/get-transport-cost-source-records.query.ts
//
// Phase O1's only read path: a paginated, filterable list of imported
// source records, for the importer to verify their own upload landed
// correctly (round-trip every row, confirm zero silent drops -- the
// audit's Section S acceptance test) and for anyone with view access to
// browse what has been imported so far. This is NOT a reporting/
// analytics query -- no aggregation, no cost-per-tonne, no totals beyond
// the plain row count pagination already gives. See the module's header
// comment in the command file for why that line is not crossed here.

import { BaseQuery } from '@/server/cqrs/query';
import { TransportCostSourceRecordFilters } from '@/shared/types/transport-cost.types';
import { PaginationParams } from '@/shared/types/common.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

export class GetTransportCostSourceRecordsQuery extends BaseQuery {
  static readonly queryName = 'GetTransportCostSourceRecordsQuery';

  constructor(
    public readonly filters: TransportCostSourceRecordFilters,
    public readonly pagination: PaginationParams,
    /**
     * Full TenantContext, not a bare tenantId -- this query is
     * org-unit-scoped (module-scope.registry.ts: 'transport-cost',
     * level 'org-unit') and must filter through
     * TenantScopedRepository.findWithPaginationInScope, exactly like
     * every other org-unit-scoped list query in this codebase.
     */
    public readonly context: TenantContext
  ) {
    super(GetTransportCostSourceRecordsQuery.queryName);
  }
}
