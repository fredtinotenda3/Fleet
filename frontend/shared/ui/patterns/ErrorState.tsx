// frontend/shared/ui/patterns/ErrorState.tsx

'use client';

import * as React from 'react';
import { AlertTriangle, Lock, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/frontend/shared/ui/primitives/button';

export type ErrorStateVariant = 'error' | 'permission' | 'offline';

interface ErrorStateProps {
  variant?: ErrorStateVariant;
  title?: string;
  description?: string;
  /**
   * The underlying message, shown small and muted. Pass the API's message,
   * not a stack trace — this is rendered to end users.
   */
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Compact form for a widget or a table body; `page` for a whole route. */
  size?: 'inline' | 'panel' | 'page';
  className?: string;
  children?: React.ReactNode;
}

const VARIANT_DEFAULTS: Record<ErrorStateVariant, { title: string; description: string; Icon: typeof AlertTriangle }> =
  {
    error: {
      title: "This didn't load",
      description: 'Something went wrong fetching this data. It is usually temporary.',
      Icon: AlertTriangle,
    },
    permission: {
      // Says what is missing without implying the data does not exist, and
      // without naming the permission constant — an end user cannot act on
      // "ANALYTICS_VIEW", they can act on "ask an administrator".
      title: 'You do not have access to this',
      description: 'Your role does not include this view. An organization administrator can grant it.',
      Icon: Lock,
    },
    offline: {
      title: 'No connection',
      description: 'The platform could not be reached. Check your connection and try again.',
      Icon: WifiOff,
    },
  };

/**
 * The explicit failure state.
 *
 * WHY: the audit found that most list pages in the product (vehicles, fuel,
 * expenses, trips, maintenance, work orders) had a loading branch and no error
 * branch at all. A failed fetch fell through to the table's empty message, so
 * an outage rendered as "No vehicles found. Try adjusting your filters or add
 * a new vehicle." — telling an operator their fleet is empty when in fact the
 * platform is broken. That is the single most damaging state a fleet system
 * can show, and it is why `DataState` treats error as a first-class branch
 * ordered ahead of empty.
 */
export function ErrorState({
  variant = 'error',
  title,
  description,
  detail,
  onRetry,
  retryLabel = 'Try again',
  size = 'panel',
  className,
  children,
}: ErrorStateProps) {
  const defaults = VARIANT_DEFAULTS[variant];
  const Icon = defaults.Icon;
  const tone = variant === 'permission' ? 'text-muted-foreground' : 'text-danger';

  if (size === 'inline') {
    return (
      <div
        role="alert"
        className={cn('flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3', className)}
      >
        <Icon className={cn('mt-0.5 size-4 shrink-0', tone)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-medium text-foreground">{title ?? defaults.title}</p>
          {detail && <p className="mt-0.5 text-caption text-muted-foreground break-words">{detail}</p>}
        </div>
        {onRetry && (
          <Button variant="ghost" size="xs" onClick={onRetry} className="shrink-0">
            <RefreshCw className="size-3" aria-hidden="true" />
            {retryLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-border bg-card px-6 text-center',
        size === 'page' ? 'py-16' : 'py-10',
        className
      )}
    >
      <span
        className={cn(
          'mb-3 inline-flex items-center justify-center rounded-full p-2.5',
          variant === 'permission' ? 'bg-muted' : 'bg-danger-bg'
        )}
      >
        <Icon className={cn('size-5', tone)} aria-hidden="true" />
      </span>
      <h3 className="text-h3 text-foreground">{title ?? defaults.title}</h3>
      <p className="mt-1.5 max-w-md text-body-sm text-muted-foreground">{description ?? defaults.description}</p>
      {detail && (
        <p className="mt-2 max-w-md text-caption text-muted-foreground/80 break-words">{detail}</p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
