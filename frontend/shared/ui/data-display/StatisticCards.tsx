'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  className?: string;
}

export function StatisticCard({ title, value, description, icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {trend && (
          <p className={cn('text-xs', trend.isPositive ? 'text-green-600' : 'text-red-600')}>
            {trend.isPositive ? '↑' : '↓'} {trend.value}%
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface StatisticCardsProps {
  children: React.ReactNode;
  className?: string;
}

export function StatisticCards({ children, className }: StatisticCardsProps) {
  return <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-4', className)}>{children}</div>;
}
