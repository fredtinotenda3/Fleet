// modules/expenses/events/ExpenseDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { EXPENSE_DELETED } from '@/server/events/event-names';

export class ExpenseDeletedEvent extends DomainEvent {
  constructor(
    expenseId: string,
    licensePlate: string,
    amount: number,
    tenantId: string,
    metadata?: Record<string, unknown>,
  ) {
    super(EXPENSE_DELETED, {
      entityId: expenseId,
      entityType: 'expense',
      license_plate: licensePlate,
      amount,
      tenantId,
    }, metadata);
  }
}