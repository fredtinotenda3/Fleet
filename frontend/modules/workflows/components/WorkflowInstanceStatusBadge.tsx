// frontend/modules/workflows/components/WorkflowInstanceStatusBadge.tsx

'use client';

import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { cn } from '@/lib/utils';
import { instanceStatusPresentation, instanceStatusLabel } from '../utils';
import type { WorkflowInstanceStatus } from '../types';

interface WorkflowInstanceStatusBadgeProps {
  status: WorkflowInstanceStatus;
  className?: string;
}

export function WorkflowInstanceStatusBadge({ status, className }: WorkflowInstanceStatusBadgeProps) {
  const presentation = instanceStatusPresentation(status);
  return (
    <Badge variant={presentation.badgeVariant} className={cn(presentation.badgeClassName, className)}>
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', presentation.dotClassName)} aria-hidden="true" />
      {instanceStatusLabel(status)}
    </Badge>
  );
}
