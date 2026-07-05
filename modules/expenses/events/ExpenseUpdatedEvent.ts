// modules/expenses/events/ExpenseUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { EXPENSE_UPDATED } from '@/server/events/event-names';
import { Expense } from '@/shared/types/expense.types';

export class ExpenseUpdatedEvent extends DomainEvent {
  constructor(
    expense: Expense,
    changes: Partial<Expense>,
    metadata?: Record<string, unknown>,
  ) {
    super(EXPENSE_UPDATED, {
      entityId: expense._id,
      entityType: 'expense',
      license_plate: expense.license_plate,
      amount: expense.amount,
      changes,
      tenantId: expense.tenantId,
    }, metadata);
  }
}