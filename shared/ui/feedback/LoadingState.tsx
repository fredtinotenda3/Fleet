// shared/ui/feedback/LoadingState.tsx

'use client';

import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { cn } from '@/lib/utils';

interface LoadingStateProps {
  type?: 'table' | 'card' | 'stats' | 'full';
  count?: number;
  className?: string;
}

export function LoadingState({ type = 'full', count = 3, className }: LoadingStateProps) {
  if (type === 'table') {
    return (
      <div className={cn('space-y-4', className)}>
        <Skeleton className="w-full h-10" />
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="w-full h-16" />
        ))}
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-4', className)}>
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="w-full h-32" />
        ))}
      </div>
    );
  }

  if (type === 'stats') {
    return (
      <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-4', className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="w-full h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center justify-center min-h-100', className)}>
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 border-b-2 rounded-full animate-spin border-primary" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}