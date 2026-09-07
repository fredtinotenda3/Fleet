// frontend/shared/ui/patterns/SectionHeader.tsx

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  title: string;
  /** One line saying what question this section answers. */
  description?: string;
  /** Small count/status chip rendered next to the title. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Renders a "see all" link on the right. */
  viewAllHref?: string;
  viewAllLabel?: string;
  className?: string;
}

/**
 * The heading for a band of content inside a page, one level below
 * `PageHeader`.
 *
 * Exists because the same three-part arrangement (title / description /
 * right-aligned action) was being rebuilt with a different heading size,
 * spacing and font weight in almost every module, which is a large part of
 * why pages did not read as one product.
 */
export function SectionHeader({
  title,
  description,
  meta,
  actions,
  viewAllHref,
  viewAllLabel = 'View all',
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h3 text-foreground">{title}</h2>
          {meta}
        </div>
        {description && <p className="mt-0.5 text-body-sm text-muted-foreground">{description}</p>}
      </div>

      {(actions || viewAllHref) && (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1 rounded-md text-body-sm font-medium text-primary hover:underline"
            >
              {viewAllLabel}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A titled panel: `SectionHeader` plus a bordered surface, which is the
 * arrangement most dashboard bands actually want.
 */
export function SectionPanel({
  title,
  description,
  meta,
  actions,
  viewAllHref,
  viewAllLabel,
  children,
  className,
  bodyClassName,
}: SectionHeaderProps & { children: React.ReactNode; bodyClassName?: string }) {
  return (
    <section className={cn('rounded-lg border border-border bg-card shadow-xs', className)}>
      <div className="border-b border-border px-4 py-3">
        <SectionHeader
          title={title}
          description={description}
          meta={meta}
          actions={actions}
          viewAllHref={viewAllHref}
          viewAllLabel={viewAllLabel}
        />
      </div>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
