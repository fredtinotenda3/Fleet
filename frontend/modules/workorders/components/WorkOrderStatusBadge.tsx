// frontend/modules/workorders/components/WorkOrderStatusBadge.tsx

'use client';

import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { cn } from '@/lib/utils';
import { WORK_ORDER_STATUS_BADGE_CLASSES } from '../utils';
import { WORK_ORDER_STATUS_LABELS } from '../types';
import type { WorkOrderStatus } from '../types';

interface WorkOrderStatusBadgeProps {
  status: WorkOrderStatus;
  className?: string;
}

export function WorkOrderStatusBadge({ status, className }: WorkOrderStatusBadgeProps) {
  return (
    <Badge className={cn(WORK_ORDER_STATUS_BADGE_CLASSES[status], className)}>
      {WORK_ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}