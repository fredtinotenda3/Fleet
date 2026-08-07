// modules/maintenance/queries/get-upcoming-reminders.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

export class GetUpcomingRemindersQuery extends BaseQuery {
  static readonly queryName = 'GetUpcomingRemindersQuery';

  constructor(
    public readonly tenantId: string,
    public readonly daysAhead: number = 7,
    public readonly context?: TenantContext
  ) {
    super(GetUpcomingRemindersQuery.queryName);
  }
}