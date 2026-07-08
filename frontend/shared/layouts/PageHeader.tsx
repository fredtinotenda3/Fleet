// frontend/shared/layouts/PageHeader.tsx

'use client';

import * as React from 'react';
import { Breadcrumbs, type BreadcrumbSegment } from '@/frontend/shared/ui/navigation/Breadcrumbs';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbSegment[];
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, breadcrumbs, actions, tabs, className }: PageHeaderProps) {
  return (
    <div className={cn('space-y-3 border-b border-border pb-4', className)}>
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h1 className="truncate text-h1 text-foreground">{title}</h1>
          {description && <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {tabs && <div>{tabs}</div>}
    </div>
  );
}