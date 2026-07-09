// frontend/modules/maintenance/components/MaintenanceTable.tsx

'use client';

import { Eye, Pencil, Trash2, CheckCircle2, Wrench } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Checkbox } from '@/frontend/shared/ui/forms/checkbox';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { formatDate } from '@/shared/utils/date.utils';
import {
  STATUS_BADGE_CLASSES,
  PRIORITY_BADGE_CLASSES,
  getStatusLabel,
  getPriorityLabel,
  formatEstimatedCost,
  isRecordOverdue,
} from '../utils';
import { MAINTENANCE_CATEGORY_LABELS, type MaintenanceCategory } from '../types';
import type { Reminder, PaginatedResponse } from '../types';

interface MaintenanceTableProps {
  result: PaginatedResponse<Reminder> | undefined;
  isLoading: boolean;
  pageSize: number;
  onPageChange: (page: number) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onView: (record: Reminder) => void;
  onEdit: (record: Reminder) => void;
  onDelete: (record: Reminder) => void;
  onComplete: (record: Reminder) => void;
  canManage: boolean;
  canDelete: boolean;
  canComplete: boolean;
}

export function MaintenanceTable({
  result,
  isLoading,
  onPageChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onView,
  onEdit,
  onDelete,
  onComplete,
  canManage,
  canDelete,
  canComplete,
}: MaintenanceTableProps) {
  if (isLoading && !result) {
    return <LoadingState type="table" count={6} />;
  }

  const records = result?.data ?? [];

  if (records.length === 0) {
    return (
      <EmptyState
        icon={<Wrench className="w-10 h-10 text-muted-foreground" />}
        title="No maintenance records found"
        description="Adjust your filters or create a new maintenance record to get started."
      />
    );
  }

  const ids = records.map((r) => r._id);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              {canDelete && (
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={() => onToggleSelectAll(ids)} />
                </TableHead>
              )}
              <TableHead>Vehicle</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Est. cost</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => {
              const overdue = isRecordOverdue(record);
              return (
                <TableRow key={record._id} className={overdue ? 'bg-red-50/40' : undefined}>
                  {canDelete && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(record._id)}
                        onCheckedChange={() => onToggleSelect(record._id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{record.license_plate}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{record.title}</TableCell>
                  <TableCell>
                    {record.category
                      ? MAINTENANCE_CATEGORY_LABELS[record.category as MaintenanceCategory] ?? record.category
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={PRIORITY_BADGE_CLASSES[record.priority ?? 'medium']}>
                      {getPriorityLabel(record.priority)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_BADGE_CLASSES[overdue ? 'overdue' : record.status]}>
                      {getStatusLabel(overdue ? 'overdue' : record.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(record.due_date)}</TableCell>
                  <TableCell>{formatEstimatedCost(record.estimated_cost)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => onView(record)} title="View">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {canManage && (
                        <Button variant="ghost" size="icon" onClick={() => onEdit(record)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canComplete && record.status !== 'completed' && (
                        <Button variant="ghost" size="icon" onClick={() => onComplete(record)} title="Mark complete">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => onDelete(record)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {result?.pagination && result.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {result.pagination.page} of {result.pagination.totalPages} ({result.pagination.total} records)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!result.pagination.hasPrev}
              onClick={() => onPageChange(result.pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!result.pagination.hasNext}
              onClick={() => onPageChange(result.pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}