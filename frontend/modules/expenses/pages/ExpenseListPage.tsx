// frontend/modules/expenses/pages/ExpenseListPage.tsx

'use client';

import { useMemo, useRef, useState } from 'react';
import { Plus, Download, FileSpreadsheet, Trash2, Printer, Upload, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Separator } from '@/frontend/shared/ui/data-display/separator';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { ImportModal, type ImportColumnDef, type ImportResponse } from '@/frontend/shared/import/ImportModal';
import { ExpenseStatsCards } from '../components/ExpenseStatsCards';
import { ExpenseFilters } from '../components/ExpenseFilters';
import { ExpensesTable } from '../components/ExpensesTable';
import { ExpenseModal, type ExpenseModalMode } from '../components/ExpenseModal';
import { useExpensesList } from '../hooks/useExpenses';
import {
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useBulkDeleteExpenses,
  useBulkImportExpenses,
} from '../hooks/useExpenseMutations';
import { expensesApi } from '../services/expenses.api';
import { exportExpenses, printExpenses, canManageExpenses, canDeleteExpenses } from '../utils';
import { EXPENSE_ROUTES } from '../routes';
import type { Expense, ExpenseTableFilters } from '../types';
import type { ExpenseFormValues } from '../schemas';

const PAGE_SIZE = 10;

const STANDARD_IMPORT_COLUMNS: ImportColumnDef[] = [
  { key: 'date', label: 'Date', required: true, type: 'date', example: '2026-07-18' },
  { key: 'license_plate', label: 'Vehicle', required: true, type: 'string', example: 'AFK4234' },
  { key: 'amount', label: 'Amount', required: true, type: 'number', example: '420.00' },
  { key: 'category', label: 'Category', required: false, type: 'string', example: 'Maintenance' },
  { key: 'jobTrip', label: 'Job / Trip', required: false, type: 'string', example: 'Trip-203' },
  { key: 'description', label: 'Description', required: false, type: 'string', example: 'Brake pads' },
];

/**
 * Legacy vendor-statement CSV parser (reference/account/costCentre style),
 * kept as-is -- feeds /api/expenses/bulk, unrelated to the new standard
 * import below.
 */
function parseCSVFile(file: File): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
        const headers = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
        const records = lines.map((line) => {
          const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
          const record: Record<string, string> = {};
          headers.forEach((h, i) => {
            record[h] = values[i] ?? '';
          });
          return {
            date: record.date || record.Date,
            reference: record.reference || record.Reference || '',
            account: record.account || record.Account || '',
            totalAmount: Number(record.amount || record.Amount || record.totalAmount || 0),
            costCentre: record.costCentre || record['Cost Centre'] || '',
            items: [record.description || record.Description || ''],
            vehiclePlate: record.license_plate || record.vehicle || record.Vehicle,
            category: record.category || record.Category,
          };
        });
        resolve(records);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function ExpenseListPage() {
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageExpenses(roles);
  const canDelete = canDeleteExpenses(roles);

  const [filters, setFilters] = useState<ExpenseTableFilters>({});
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalMode, setModalMode] = useState<ExpenseModalMode>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeExpense, setActiveExpense] = useState<Expense | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const listParams = useMemo(() => ({ ...filters, page, limit: PAGE_SIZE }), [filters, page]);
  const { data: result, isLoading } = useExpensesList(listParams);

  const createExpense = useCreateExpense();
  const updateExpenseMutation = useUpdateExpense(activeExpense?._id ?? '');
  const deleteExpense = useDeleteExpense();
  const bulkDeleteExpenses = useBulkDeleteExpenses();
  const bulkImportExpenses = useBulkImportExpenses();

  function handleFiltersChange(next: ExpenseTableFilters) {
    setFilters(next);
    setPage(1);
  }

  function openCreate() {
    setModalMode('create');
    setActiveExpense(null);
    setModalOpen(true);
  }

  function openView(expense: Expense) {
    setModalMode('edit');
    setActiveExpense(expense);
    setModalOpen(true);
  }

  function openEdit(expense: Expense) {
    setModalMode('edit');
    setActiveExpense(expense);
    setModalOpen(true);
  }

  async function handleSubmit(values: ExpenseFormValues) {
    if (modalMode === 'edit' && activeExpense?._id) {
      await updateExpenseMutation.mutateAsync(values);
    } else {
      await createExpense.mutateAsync(values);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...ids]);
    });
  }

  async function handleDelete(expense: Expense) {
    if (!expense._id) return;
    if (!window.confirm(`Delete this expense for ${expense.license_plate}?`)) return;
    await deleteExpense.mutateAsync({ id: expense._id, soft: true });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(expense._id!);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected expense(s)?`)) return;
    await bulkDeleteExpenses.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  async function handleLegacyImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const records = await parseCSVFile(file);
      await bulkImportExpenses.mutateAsync(records);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleStandardImport(records: Array<Record<string, unknown>>): Promise<ImportResponse> {
    return expensesApi.importStandard(records);
  }

  async function handleExport(format: 'csv' | 'xlsx') {
    try {
      const { truncated, totalMatched, rowsExported } = await exportExpenses(filters, format);
      if (truncated) {
        toast.warning(
          `Export limited to ${rowsExported.toLocaleString()} of ${totalMatched.toLocaleString()} matching expenses. Narrow your filters to export the rest.`
        );
      } else {
        toast.success(`Exported ${rowsExported.toLocaleString()} expense${rowsExported === 1 ? '' : 's'}`);
      }
    } catch {
      toast.error('Failed to export expenses');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="All expenses"
        description="Every recorded expense across your fleet."
        breadcrumbs={[{ label: 'Expenses', href: EXPENSE_ROUTES.dashboard }, { label: 'All expenses' }]}
        actions={
          <div className="flex items-center gap-2">
            {canDelete && selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete ({selectedIds.size})
              </Button>
            )}
            {canManage && (
              <Button size="sm" onClick={() => setImportModalOpen(true)}>
                <UploadCloud className="h-3.5 w-3.5" />
                Import expenses
              </Button>
            )}
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleLegacyImportFile} />
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={bulkImportExpenses.isPending}
                title="Legacy vendor-statement CSV import"
              >
                <Upload className="h-3.5 w-3.5" />
                Import statement (legacy)
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void handleExport('csv')}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleExport('xlsx')}>
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => printExpenses()}>
                  <Printer className="mr-2 h-3.5 w-3.5" />
                  Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                Record expense
              </Button>
            )}
          </div>
        }
      />

      <ExpenseStatsCards />

      <div className="p-4 space-y-4 surface-card">
        <ExpenseFilters filters={filters} onChange={handleFiltersChange} />
        <Separator />
        <ExpensesTable
          result={result}
          isLoading={isLoading}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onView={openView}
          onEdit={openEdit}
          onDelete={handleDelete}
          canManage={canManage}
          canDelete={canDelete}
        />
      </div>

      <ExpenseModal open={modalOpen} mode={modalMode} expense={activeExpense} onOpenChange={setModalOpen} onSubmit={handleSubmit} />

      <ImportModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        title="Import expenses"
        description="Upload a CSV or Excel file with your expense records. Download the template below to see the expected columns."
        columns={STANDARD_IMPORT_COLUMNS}
        onImport={handleStandardImport}
      />
    </div>
  );
}