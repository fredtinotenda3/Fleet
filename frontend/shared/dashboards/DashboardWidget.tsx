// frontend/shared/dashboards/DashboardWidget.tsx

'use client';

import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { cn } from '@/lib/utils';

interface DashboardWidgetProps {
  title: string;
  icon?: React.ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRefresh?: () => void;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export function DashboardWidget({
  title,
  icon,
  isLoading,
  isError,
  errorMessage = 'Failed to load this widget.',
  onRefresh,
  actions,
  footer,
  className,
  bodyClassName,
  children,
}: DashboardWidgetProps) {
  return (
    <section className={cn('flex flex-col surface-card', className)} aria-label={title}>
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center min-w-0 gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <h3 className="truncate text-h3">{title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              aria-label={`Refresh ${title}`}
              disabled={isLoading}
              className="flex items-center justify-center w-6 h-6 transition-colors rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <div className={cn('flex-1 p-4', bodyClassName)}>
        {isError ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <AlertTriangle className="w-5 h-5 text-danger" aria-hidden="true" />
            <p className="text-body-sm text-muted-foreground">{errorMessage}</p>
            {onRefresh && (
              <Button size="sm" variant="outline" onClick={onRefresh}>
                Retry
              </Button>
            )}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="w-5 h-5" />
          </div>
        ) : (
          children
        )}
      </div>

      {footer && <footer className="border-t border-border px-4 py-2.5">{footer}</footer>}
    </section>
  );
}
