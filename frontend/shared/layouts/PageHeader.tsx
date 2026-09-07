// frontend/shared/layouts/PageHeader.tsx

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Breadcrumbs, type BreadcrumbSegment } from '@/frontend/shared/ui/navigation/Breadcrumbs';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbSegment[];
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  /**
   * ADDED. Context chips shown under the title — the org unit in scope, the
   * period a figure covers, when the data was last refreshed. In an
   * org-unit-scoped multi-tenant product, "which slice of the fleet am I
   * looking at" is not decoration; without it two branch managers see
   * different numbers on an identical-looking screen.
   */
  meta?: React.ReactNode;
  /** ADDED. Back link for detail pages, so a nested route has an exit that is not the browser button. */
  backHref?: string;
  backLabel?: string;
  /** ADDED. Suppress breadcrumbs where the header is embedded inside another page. */
  hideBreadcrumbs?: boolean;
  className?: string;
}

/**
 * The page header used by every route.
 *
 * At audit time 37 pages used this and roughly 25 hand-rolled their own —
 * `<h1 className="text-h1">`, `<h1 className="text-2xl font-semibold">`,
 * `<h1 className="text-xl font-semibold">` — across reports, organizations,
 * platform-admin, observability, finance, auth and tracker mapping. Three
 * different title sizes and no breadcrumbs is most of what made the product
 * feel like separate applications stitched together.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  tabs,
  meta,
  backHref,
  backLabel = 'Back',
  hideBreadcrumbs = false,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('border-b border-border pb-4', className)}>
      {!hideBreadcrumbs && (
        <div className="mb-2">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      )}

      {backHref && (
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1 text-caption font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {backLabel}
        </Link>
      )}

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h1 className="truncate text-h1 text-foreground">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-body-sm text-muted-foreground">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">{meta}</div>}
        </div>
        {actions && (
          // `flex-wrap` rather than `shrink-0`: a header with three action
          // buttons used to force horizontal page scroll on a phone.
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        )}
      </div>

      {tabs && <div className="mt-4">{tabs}</div>}
    </div>
  );
}

/**
 * A single context chip for the `meta` slot.
 *
 * Deliberately quiet — a label/value pair, not a badge. These sit under every
 * page title, so anything louder competes with the page content.
 */
export function PageHeaderMeta({
  label,
  value,
  icon,
  title,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground" title={title}>
      {icon && <span className="[&>svg]:size-3.5" aria-hidden="true">{icon}</span>}
      <span className="text-muted-foreground/80">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}
