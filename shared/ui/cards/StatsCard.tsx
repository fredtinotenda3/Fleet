// shared/ui/cards/StatsCard.tsx

'use client';

import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  loading?: boolean;
  color?: string;
  className?: string;
}

const colorVariants = {
  blue: 'from-blue-500 to-blue-600',
  green: 'from-green-500 to-green-600',
  red: 'from-red-500 to-red-600',
  yellow: 'from-yellow-500 to-yellow-600',
  purple: 'from-purple-500 to-purple-600',
  gray: 'from-gray-500 to-gray-600',
};

export function StatsCard({
  title,
  value,
  icon,
  description,
  trend,
  loading = false,
  color = 'blue',
  className,
}: StatsCardProps) {
  if (loading) {
    return (
      <Card className={cn('relative overflow-hidden', className)}>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {icon && <div className="w-4 h-4">{icon}</div>}
        </CardHeader>
        <CardContent>
          <Skeleton className="w-24 h-8 mb-2" />
          {description && <Skeleton className="w-32 h-3" />}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <div className={cn(`absolute inset-0 bg-linear-to-br opacity-5 ${colorVariants[color as keyof typeof colorVariants]}`)} />
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon && <div className="w-5 h-5 text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        {trend && (
          <div className="flex items-center gap-1 mt-2">
            <span className={cn('text-xs font-medium', trend.isPositive ? 'text-green-600' : 'text-red-600')}>
              {trend.isPositive ? '+' : ''}{trend.value}%
            </span>
            <span className="text-xs text-muted-foreground">from last period</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}