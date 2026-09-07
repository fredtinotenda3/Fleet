// shared/ui/feedback/EmptyState.tsx

'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/frontend/shared/ui/primitives/button';

/**
 * An empty state's job is to tell someone what this module is FOR and what to
 * do next — not to report that a query returned zero rows.
 *
 * This component is used in 61 places, so it was improved in place rather
 * than replaced. Every previously valid prop still behaves exactly as before;
 * everything added is optional:
 *
 *   tone             'positive' for a genuinely good empty ("no active
 *                    alerts") so a healthy fleet does not look broken.
 *   action.href      a link instead of a click handler, so an empty state can
 *                    point at "/vehicles/new" without the caller wiring a
 *                    router push.
 *   secondaryAction  the lower-commitment path (import a CSV, read the docs)
 *                    next to the primary one.
 *   hints            the short list of what this module unlocks once it has
 *                    data. This is what turns "No vehicles found" into
 *                    something a new customer can act on.
 *   size             'sm' for inside a widget or a table body.
 */

interface EmptyStateAction {
  label: string;
  /** Mutually exclusive with `href`. */
  onClick?: () => void;
  /** Mutually exclusive with `onClick`. */
  href?: string;
}

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  /** Short contextual guidance — what becomes available once data exists. */
  hints?: string[];
  /**
   * 'positive' renders a success-toned icon well and is the correct choice
   * for "nothing needs attention": an operations console that shows a grey
   * void when the fleet is healthy trains people to distrust it.
   */
  tone?: 'default' | 'positive';
  size?: 'sm' | 'md';
  className?: string;
}

function ActionButton({
  action,
  variant,
  size,
}: {
  action: EmptyStateAction;
  variant: 'default' | 'outline';
  size: 'sm' | 'default';
}) {
  if (action.href) {
    // `nativeButton={false}` is required whenever Base UI's Button renders as
    // an anchor — it stops button-only DOM props being forwarded onto the
    // <a>. Matches the two existing render={<Link/>} call sites in the app.
    return (
      <Button variant={variant} size={size} render={<Link href={action.href} />} nativeButton={false}>
        {action.label}
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  secondaryAction,
  hints,
  tone = 'default',
  size = 'md',
  className,
}: EmptyStateProps) {
  const compact = size === 'sm';
  const resolvedIcon =
    icon ?? (tone === 'positive' ? <CheckCircle2 className="size-6" aria-hidden="true" /> : null);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4' : 'py-12 px-6',
        className
      )}
    >
      {resolvedIcon && (
        <div
          className={cn(
            'mb-3 inline-flex items-center justify-center rounded-full p-2.5 [&>svg]:size-5',
            tone === 'positive' ? 'bg-success-bg text-success' : 'bg-muted text-muted-foreground'
          )}
        >
          {resolvedIcon}
        </div>
      )}

      <h3 className={cn('text-foreground', compact ? 'text-body font-semibold' : 'text-h3')}>{title}</h3>

      {description && (
        <p className={cn('mt-1.5 max-w-md text-muted-foreground', compact ? 'text-caption' : 'text-body-sm')}>
          {description}
        </p>
      )}

      {hints && hints.length > 0 && (
        <ul className="mt-3 max-w-md space-y-1 text-left">
          {hints.map((hint) => (
            <li key={hint} className="flex items-start gap-2 text-caption text-muted-foreground">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
              <span>{hint}</span>
            </li>
          ))}
        </ul>
      )}

      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action && <ActionButton action={action} variant="default" size={compact ? 'sm' : 'default'} />}
          {secondaryAction && (
            <ActionButton action={secondaryAction} variant="outline" size={compact ? 'sm' : 'default'} />
          )}
        </div>
      )}
    </div>
  );
}
