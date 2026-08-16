'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { cn } from '@/lib/utils';

interface ChartContainerProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  /** Optional header-right content, e.g. a ChartExportButton. */
  actions?: React.ReactNode;
}

export function ChartContainer({ title, children, className, actions }: ChartContainerProps) {
  if (!title) {
    return <div className={cn('w-full', className)}>{children}</div>;
  }

  return (
    <Card className={className}>
      <CardHeader className={actions ? 'flex flex-row items-start justify-between gap-4 space-y-0' : undefined}>
        <CardTitle>{title}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
