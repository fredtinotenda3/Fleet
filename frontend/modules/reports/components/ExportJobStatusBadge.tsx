// frontend/modules/reports/components/ExportJobStatusBadge.tsx

import { Loader2, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS,
  type ExecutionStatus,
} from '../utils/exportFormatters';

const STATUS_ICONS: Record<ExecutionStatus, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  processing: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
};

interface ExportJobStatusBadgeProps {
  status: ExecutionStatus;
  className?: string;
}

export function ExportJobStatusBadge({ status, className }: ExportJobStatusBadgeProps) {
  const Icon = STATUS_ICONS[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        EXECUTION_STATUS_COLORS[status],
        className,
      )}
    >
      <Icon className={cn('h-3 w-3', status === 'processing' && 'animate-spin')} aria-hidden="true" />
      {EXECUTION_STATUS_LABELS[status]}
    </span>
  );
}