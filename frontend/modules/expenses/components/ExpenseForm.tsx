
// frontend/modules/expenses/components/ExpenseForm.tsx

'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { useVehiclesList } from '@/frontend/modules/vehicles/hooks/useVehicles';
import { useExpenseTypes } from '../hooks/useExpenses';
import { useCreateExpenseType } from '../hooks/useExpenseMutations';
import { expenseFormSchema, type ExpenseFormValues } from '../schemas';
import { DEFAULT_EXPENSE_CATEGORIES } from '../types';

const NO_TYPE = '__none__';

interface ExpenseFormProps {
  defaultValues?: Partial<ExpenseFormValues>;
  onSubmit: (values: ExpenseFormValues) => Promise<unknown>;
  onCancel: () => void;
  submitLabel?: string;
}

const FALLBACK_DEFAULTS: ExpenseFormValues = {
  license_plate: '',
  amount: 0,
  date: new Date().toISOString().slice(0, 10),
  expense_type_id: '',
  description: '',
  jobTrip: '',
  notes: '',
};

export function ExpenseForm({ defaultValues, onSubmit, onCancel, submitLabel = 'Record expense' }: ExpenseFormProps) {
  const { data: vehicles } = useVehiclesList({ limit: 1000 });
  const { data: expenseTypes, isLoading: typesLoading } = useExpenseTypes();
  const createExpenseType = useCreateExpenseType();

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryGroup, setNewCategoryGroup] = useState<string>(DEFAULT_EXPENSE_CATEGORIES[0]);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: { ...FALLBACK_DEFAULTS, ...defaultValues },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  async function handleQuickAdd() {
    if (!newCategoryName.trim()) return;
    const created = await createExpenseType.mutateAsync({
      name: newCategoryName.trim(),
      category: newCategoryGroup,
    });
    setValue('expense_type_id', created._id, { shouldValidate: true, shouldDirty: true });
    setNewCategoryName('');
    setQuickAddOpen(false);
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="license_plate" className="form-label form-required">Vehicle</Label>
            <Controller
              control={control}
              name="license_plate"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="license_plate" className="w-full">
                    <SelectValue placeholder="Select vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles?.data?.map((v) => (
                      <SelectItem key={v._id} value={v.license_plate}>
                        {v.license_plate} - {v.make} {v.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.license_plate && <p className="form-error" role="alert">{errors.license_plate.message}</p>}
          </div>

          <div>
            <Label htmlFor="date" className="form-label form-required">Date</Label>
            <Input id="date" type="date" className={errors.date ? 'input-error' : undefined} {...register('date')} />
            {errors.date && <p className="form-error" role="alert">{errors.date.message}</p>}
          </div>

          <div>
            <Label htmlFor="amount" className="form-label form-required">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              className={errors.amount ? 'input-error' : undefined}
              {...register('amount', {
                setValueAs: (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
              })}
            />
            {errors.amount && <p className="form-error" role="alert">{errors.amount.message}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="expense_type_id" className="form-label">Category</Label>
              <button
                type="button"
                onClick={() => setQuickAddOpen(true)}
                className="flex items-center gap-1 text-caption text-primary hover:underline"
              >
                <Plus className="w-3 h-3" /> New category
              </button>
            </div>
            <Controller
              control={control}
              name="expense_type_id"
              render={({ field }) => (
                <Select
                  value={field.value || NO_TYPE}
                  onValueChange={(v) => field.onChange(v === NO_TYPE ? '' : v)}
                  disabled={typesLoading}
                >
                  <SelectTrigger id="expense_type_id" className="w-full">
                    <SelectValue placeholder="Uncategorized" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TYPE}>Uncategorized</SelectItem>
                    {expenseTypes?.map((t) => (
                      <SelectItem key={t._id} value={t._id!}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div>
            <Label htmlFor="jobTrip" className="form-label">Job / Trip reference</Label>
            <Input id="jobTrip" placeholder="e.g. Trip #482, Job Order 12" {...register('jobTrip')} />
          </div>
        </div>

        <div>
          <Label htmlFor="description" className="form-label">Description</Label>
          <Input id="description" placeholder="What was this expense for?" {...register('description')} />
        </div>

        <div>
          <Label htmlFor="notes" className="form-label">Notes</Label>
          <Textarea id="notes" rows={3} {...register('notes')} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner className="w-4 h-4 mr-2" />}
            {submitLabel}
          </Button>
        </div>
      </form>

      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="sm:max-w-form-narrow">
          <DialogHeader>
            <DialogTitle>New expense category</DialogTitle>
            <DialogDescription>Add a category to classify this and future expenses.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-category-name" className="form-label form-required">Category name</Label>
              <Input
                id="new-category-name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Toll Fees"
              />
            </div>
            <div>
              <Label htmlFor="new-category-group" className="form-label">Group</Label>
              <Select value={newCategoryGroup} onValueChange={setNewCategoryGroup}>
                <SelectTrigger id="new-category-group" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setQuickAddOpen(false)}>Cancel</Button>
              <Button
                type="button"
                onClick={handleQuickAdd}
                disabled={!newCategoryName.trim() || createExpenseType.isPending}
              >
                {createExpenseType.isPending && <Spinner className="w-4 h-4 mr-2" />}
                Add category
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}