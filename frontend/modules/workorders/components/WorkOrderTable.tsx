// frontend/modules/workorders/components/WorkOrderTable.tsx

'use client';

import { Eye, UserPlus, Wrench } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { formatDate } from '@/shared/utils/date.utils';
import { WorkOrderStatusBadge } from './WorkOrderStatusBadge';
import { PRIORITY_BADGE_CLASSES, getPriorityLabel, formatWorkOrderCost } from '../utils';
import type { WorkOrder, PaginatedResponse } from '../types';

interface WorkOrderTableProps {
  result: PaginatedResponse<WorkOrder> | undefined;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onView: (workOrder: WorkOrder) => void;
  onAssign: (workOrder: WorkOrder) => void;
  canAssign: boolean;
}

export function WorkOrderTable({ result, isLoading, onPageChange, onView, onAssign, canAssign }: WorkOrderTableProps) {
  if (isLoading && !result) {
    return <LoadingState type="table" count={6} />;
  }

  const workOrders = result?.data ?? [];

  if (workOrders.length === 0) {
    return (
      <EmptyState
        icon={<Wrench className="w-10 h-10 text-muted-foreground" />}
        title="No work orders found"
        description="Adjust your filters, or a work order will appear here automatically the next time a driver reports a defect."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>Total cost</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workOrders.map((workOrder) => (
              <TableRow key={workOrder._id}>
                <TableCell className="font-medium">{workOrder.license_plate}</TableCell>
                <TableCell className="truncate max-w-55">{workOrder.title}</TableCell>
                <TableCell>
                  {workOrder.source === 'dvir' ? (
                    <Badge variant="outline">Driver inspection</Badge>
                  ) : workOrder.source === 'reminder' ? (
                    <Badge variant="outline">Maintenance</Badge>
                  ) : (
                    <Badge variant="outline">Manual</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={PRIORITY_BADGE_CLASSES[workOrder.priority ?? 'medium']}>
                    {getPriorityLabel(workOrder.priority)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <WorkOrderStatusBadge status={workOrder.status} />
                </TableCell>
                <TableCell>{formatDate(workOrder.openedAt)}</TableCell>
                <TableCell>{formatWorkOrderCost(workOrder.totalCost)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => onView(workOrder)} title="View">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {canAssign && workOrder.status === 'open' && (
                      <Button variant="ghost" size="icon" onClick={() => onAssign(workOrder)} title="Assign mechanic">
                        <UserPlus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {result?.pagination && result.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {result.pagination.page} of {result.pagination.totalPages} ({result.pagination.total} work orders)
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