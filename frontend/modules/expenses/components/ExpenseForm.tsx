'use client';

import { useState, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
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
import { useExpenseTypes, expenseKeys } from '../hooks/useExpenses';
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
  const queryClient = useQueryClient();

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryGroup, setNewCategoryGroup] = useState<string>(DEFAULT_EXPENSE_CATEGORIES[0]);

  console.log('🔍 ExpenseForm - Available expense types:', expenseTypes);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: { ...FALLBACK_DEFAULTS, ...defaultValues },
  });

  // Watch all form values for debugging
  const allValues = watch();
  console.log('👀 Form values:', allValues);

  const submit = useCallback(
    handleSubmit(async (values) => {
      console.log('📤 Form submit - raw values:', values);
      console.log('📤 Form submit - expense_type_id:', values.expense_type_id);
      console.log('📤 Form submit - expense_type_id type:', typeof values.expense_type_id);
      
      // FIX: Ensure expense_type_id is properly handled
      const cleanedValues: ExpenseFormValues = {
        ...values,
        expense_type_id: values.expense_type_id || undefined,
      };
      
      console.log('📤 Form submit - cleaned values:', cleanedValues);
      await onSubmit(cleanedValues);
    }),
    [handleSubmit, onSubmit]
  );

  async function handleQuickAdd() {
    if (!newCategoryName.trim()) return;
    
    try {
      console.log('🆕 Creating expense type:', newCategoryName.trim(), 'in group:', newCategoryGroup);
      
      const created = await createExpenseType.mutateAsync({
        name: newCategoryName.trim(),
        category: newCategoryGroup,
      });

      console.log('✅ Created expense type response:', created);
      console.log('✅ Created expense type _id:', created._id);

      // Validate MongoDB ObjectId (24 hex characters)
      if (!created._id || !/^[a-fA-F0-9]{24}$/.test(created._id)) {
        console.error('❌ Invalid expense type _id:', created._id);
        throw new Error('Invalid expense type ID received');
      }

      // Refresh the list
      await queryClient.invalidateQueries({ queryKey: expenseKeys.types() });
      await queryClient.refetchQueries({ queryKey: expenseKeys.types() });

      // Check what's in the cache after refetch
      const updatedTypes = queryClient.getQueryData(expenseKeys.types());
      console.log('📋 Updated expense types in cache:', updatedTypes);
      
      // Set the value
      console.log('🎯 Setting expense_type_id to:', created._id);
      setValue('expense_type_id', created._id, { 
        shouldValidate: true, 
        shouldDirty: true 
      });
      
      // Verify it was set
      const currentValue = getValues('expense_type_id');
      console.log('✔️ Current expense_type_id after setValue:', currentValue);
      
      setNewCategoryName('');
      setQuickAddOpen(false);
    } catch (error) {
      console.error('❌ Failed to create expense type:', error);
    }
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
              render={({ field }) => {
                console.log('🔘 Select field value:', field.value);
                console.log('🔘 Select field value type:', typeof field.value);
                
                return (
                  <Select
                    value={field.value || NO_TYPE}
                    onValueChange={(v) => {
                      console.log('🔄 Select onValueChange - new value:', v);
                      console.log('🔄 Select onValueChange - NO_TYPE:', NO_TYPE);
                      const newValue = v === NO_TYPE ? '' : v;
                      console.log('🔄 Select onValueChange - final value:', newValue);
                      field.onChange(newValue);
                    }}
                  >
                    <SelectTrigger id="expense_type_id" className="w-full" disabled={typesLoading}>
                      <SelectValue placeholder={typesLoading ? 'Loading categories…' : 'Uncategorized'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TYPE}>Uncategorized</SelectItem>
                      {expenseTypes?.map((t) => {
                        console.log('📋 Expense type option:', { id: t._id, name: t.name });
                        return (
                          <SelectItem key={t._id} value={t._id!}>{t.name}</SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                );
              }}
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
              <Select value={newCategoryGroup} onValueChange={(v) => v && setNewCategoryGroup(v)}>
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