// modules/maintenance/queries/get-overdue-reminders.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

export class GetOverdueRemindersQuery extends BaseQuery {
  static readonly queryName = 'GetOverdueRemindersQuery';

  constructor(public readonly tenantId: string,
    public readonly context?: TenantContext
  ) {
    super(GetOverdueRemindersQuery.queryName);
  }
}