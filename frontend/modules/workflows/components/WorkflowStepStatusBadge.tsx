// frontend/modules/workflows/components/WorkflowStepStatusBadge.tsx

'use client';

import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { cn } from '@/lib/utils';
import { stepStatusPresentation, stepStatusLabel } from '../utils';
import type { WorkflowStepInstanceStatus } from '../types';

interface WorkflowStepStatusBadgeProps {
  status: WorkflowStepInstanceStatus;
  className?: string;
}

export function WorkflowStepStatusBadge({ status, className }: WorkflowStepStatusBadgeProps) {
  const presentation = stepStatusPresentation(status);
  return (
    <Badge variant={presentation.badgeVariant} className={cn(presentation.badgeClassName, className)}>
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', presentation.dotClassName)} aria-hidden="true" />
      {stepStatusLabel(status)}
    </Badge>
  );
}
