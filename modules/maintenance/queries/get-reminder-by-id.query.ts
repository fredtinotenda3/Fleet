// modules/maintenance/queries/get-reminder-by-id.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetReminderByIdQuery extends BaseQuery {
  static readonly queryName = 'GetReminderByIdQuery';

  constructor(
    public readonly reminderId: string,
    public readonly tenantId: string
  ) {
    super(GetReminderByIdQuery.queryName);
  }
}