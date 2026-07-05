// modules/maintenance/queries/get-overdue-reminders.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetOverdueRemindersQuery extends BaseQuery {
  constructor(public readonly tenantId: string) {
    super(GetOverdueRemindersQuery.name);
  }
}