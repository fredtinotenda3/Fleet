'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { ExpenseForm } from './ExpenseForm';
import type { Expense } from '../types';
import type { ExpenseFormValues } from '../schemas';

export type ExpenseModalMode = 'create' | 'edit';

interface ExpenseModalProps {
  open: boolean;
  mode: ExpenseModalMode;
  expense?: Expense | null;
  defaultLicensePlate?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ExpenseFormValues) => Promise<unknown>;
}

const TITLES: Record<ExpenseModalMode, string> = {
  create: 'Record expense',
  edit: 'Edit expense',
};

const DESCRIPTIONS: Record<ExpenseModalMode, string> = {
  create: 'Log a new expense against a vehicle in your fleet.',
  edit: "Update this expense's details.",
};

function toFormValues(
  expense: Expense | null | undefined,
  defaultLicensePlate?: string
): Partial<ExpenseFormValues> | undefined {
  if (!expense) {
    return defaultLicensePlate ? { license_plate: defaultLicensePlate } : undefined;
  }
  const dateStr = typeof expense.date === 'string' ? expense.date : new Date(expense.date).toISOString();
  return {
    license_plate: expense.license_plate,
    amount: expense.amount,
    date: dateStr.slice(0, 10),
    expense_type_id: expense.expense_type_id || '',
    description: expense.description || '',
    jobTrip: expense.jobTrip || '',
    notes: expense.notes || '',
  };
}

export function ExpenseModal({ open, mode, expense, defaultLicensePlate, onOpenChange, onSubmit }: ExpenseModalProps) {
  const handleSubmit = async (values: ExpenseFormValues) => {
    await onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>{TITLES[mode]}</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[mode]}</DialogDescription>
        </DialogHeader>
        <ExpenseForm
          /**
           * FIX: this previously included `Date.now()`, which changes on
           * every render -- forcing React to fully unmount/remount
           * <ExpenseForm> (wiping all in-progress field state, including
           * a just-picked expense_type_id) on any re-render while the
           * modal was open, not just when it actually opened for a new/
           * different expense. The key only needs to change when we
           * genuinely want a fresh form: switching between create/edit,
           * or editing a different expense record. `open` is included so
           * closing and reopening in 'create' mode also starts clean,
           * without needing a render-varying value like Date.now().
           */
          key={`${mode}-${expense?._id ?? 'new'}-${open}`}
          defaultValues={toFormValues(expense, defaultLicensePlate)}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel={mode === 'edit' ? 'Save changes' : 'Record expense'}
        />
      </DialogContent>
    </Dialog>
  );
}