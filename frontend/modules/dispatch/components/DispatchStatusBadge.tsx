// frontend/modules/dispatch/components/DispatchStatusBadge.tsx

'use client';

import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { cn } from '@/lib/utils';
import { DISPATCH_STATUS_BADGE_CLASSES } from '../utils';
import { DISPATCH_JOB_STATUS_LABELS } from '../types';
import type { DispatchJobStatus } from '../types';

interface DispatchStatusBadgeProps {
  status: DispatchJobStatus;
  className?: string;
}

export function DispatchStatusBadge({ status, className }: DispatchStatusBadgeProps) {
  return (
    <Badge className={cn(DISPATCH_STATUS_BADGE_CLASSES[status], className)}>
      {DISPATCH_JOB_STATUS_LABELS[status]}
    </Badge>
  );
}
