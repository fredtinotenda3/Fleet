// modules/maintenance/queries/get-upcoming-reminders.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetUpcomingRemindersQuery extends BaseQuery {
  static readonly queryName = 'GetUpcomingRemindersQuery';

  constructor(
    public readonly tenantId: string,
    public readonly daysAhead: number = 7
  ) {
    super(GetUpcomingRemindersQuery.queryName);
  }
}