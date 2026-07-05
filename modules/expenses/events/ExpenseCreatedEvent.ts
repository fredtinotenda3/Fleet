// modules/expenses/events/ExpenseCreatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { EXPENSE_CREATED } from '@/server/events/event-names';
import { Expense } from '@/shared/types/expense.types';

export class ExpenseCreatedEvent extends DomainEvent {
  constructor(expense: Expense, metadata?: Record<string, unknown>) {
    super(EXPENSE_CREATED, {
      entityId: expense._id,
      entityType: 'expense',
      license_plate: expense.license_plate,
      amount: expense.amount,
      date: expense.date,
      tenantId: expense.tenantId,
    }, metadata);
  }
}