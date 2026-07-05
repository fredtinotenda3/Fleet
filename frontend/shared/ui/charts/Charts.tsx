'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { cn } from '@/lib/utils';

interface ChartContainerProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function ChartContainer({ title, children, className }: ChartContainerProps) {
  if (!title) {
    return <div className={cn('w-full', className)}>{children}</div>;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
