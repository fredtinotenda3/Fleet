// frontend/shared/ui/patterns/StatusBadge.tsx

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  FLEET_STATUS_LABEL,
  FLEET_STATUS_TONE,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  TONE_CLASSES,
  type FleetStatus,
  type SeverityLevel,
  type Tone,
} from './tone';

interface StatusBadgeProps {
  /** Visible text. Required — a badge that is only a colour is not accessible. */
  children: React.ReactNode;
  tone?: Tone;
  /**
   * Show a filled dot before the label. On by default: it gives the badge a
   * second, non-colour channel, which is what keeps the status readable for
   * the ~8% of male users with a colour vision deficiency (WCAG 1.4.1, "use
   * of colour").
   */
  dot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  title?: string;
}

/**
 * The one status badge.
 *
 * Replaces per-module colour logic that had drifted into at least four
 * different vocabularies (`variant="destructive"`, raw `bg-red-100`, the
 * `.badge-danger` component class, and inline ternaries on `text-success`).
 */
export function StatusBadge({
  children,
  tone = 'neutral',
  dot = true,
  size = 'sm',
  className,
  title,
}: StatusBadgeProps) {
  const t = TONE_CLASSES[tone];
  return (
    <span
      title={title}
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-caption' : 'px-2.5 py-1 text-body-sm',
        t.surface,
        className
      )}
    >
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', t.dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Severity as produced by the intelligence layer. */
export function SeverityBadge({
  severity,
  className,
  size,
}: {
  severity: SeverityLevel;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <StatusBadge tone={SEVERITY_TONE[severity]} className={className} size={size}>
      {SEVERITY_LABEL[severity]}
    </StatusBadge>
  );
}

/** Live operational state of a vehicle. */
export function FleetStatusBadge({
  status,
  className,
  size,
  title,
}: {
  status: FleetStatus;
  className?: string;
  size?: 'sm' | 'md';
  title?: string;
}) {
  return (
    <StatusBadge tone={FLEET_STATUS_TONE[status]} className={className} size={size} title={title}>
      {FLEET_STATUS_LABEL[status]}
    </StatusBadge>
  );
}

/**
 * A bare status dot, for dense contexts (table cells, map legends) where a
 * full badge would not fit.
 *
 * `label` is required and rendered to assistive technology even though it is
 * visually hidden — a coloured dot alone conveys nothing to a screen reader,
 * and this component is used in tables where the dot is the only indicator.
 */
export function StatusDot({
  tone = 'neutral',
  label,
  pulse = false,
  className,
}: {
  tone?: Tone;
  label: string;
  /** Reserved for genuinely live state (a moving vehicle). Respects prefers-reduced-motion via the global rule in globals.css. */
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      <span
        className={cn('size-2 shrink-0 rounded-full', TONE_CLASSES[tone].dot, pulse && 'animate-pulse')}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
