// modules/maintenance/queries/get-reminders.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { MaintenanceFilters } from '@/shared/types/maintenance.types';
import { PaginationParams } from '@/shared/types/common.types';

export class GetRemindersQuery extends BaseQuery {
  static readonly queryName = 'GetRemindersQuery';

  constructor(
    public readonly filters: MaintenanceFilters,
    public readonly pagination: PaginationParams,
    public readonly tenantId: string
  ) {
    super(GetRemindersQuery.queryName);
  }
}