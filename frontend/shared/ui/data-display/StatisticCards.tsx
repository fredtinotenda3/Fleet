'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  /**
   * Widened from `string | number` to `React.ReactNode` so cards can
   * render richer content (e.g. a colored category badge) where a plain
   * number/string isn't expressive enough. Every existing caller passes
   * a string or number, both of which are valid ReactNode, so this is
   * purely additive -- no existing usage needs to change.
   */
  value: React.ReactNode;
  description?: string;
  icon?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  className?: string;
}

export function StatisticCard({ title, value, description, icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn('transition-shadow hover:shadow-md', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold leading-tight">{value}</div>
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