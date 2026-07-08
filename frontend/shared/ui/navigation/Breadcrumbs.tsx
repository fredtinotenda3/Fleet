
// frontend/shared/ui/navigation/Breadcrumbs.tsx

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  /** Explicit trail; if omitted, derived from the current pathname. */
  items?: BreadcrumbSegment[];
  className?: string;
}

const LABEL_OVERRIDES: Record<string, string> = {
  organizations: 'Organizations',
  dashboard: 'Dashboard',
  vehicles: 'Vehicles',
  expenses: 'Expenses',
  fuel: 'Fuel',
  maintenance: 'Maintenance',
  trips: 'Trips',
  reports: 'Reports',
  analytics: 'Analytics',
  settings: 'Settings',
  members: 'Members',
  roles: 'Roles & Permissions',
  teams: 'Teams',
  'audit-log': 'Audit Log',
  advanced: 'Advanced',
  select: 'Select Organization',
  security: 'Security',
  sessions: 'Sessions',
  'account-security': 'Account Security',
  profile: 'Profile',
};

function humanize(segment: string): string {
  if (LABEL_OVERRIDES[segment]) return LABEL_OVERRIDES[segment];
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveFromPathname(pathname: string): BreadcrumbSegment[] {
  const parts = pathname.split('/').filter(Boolean);
  let acc = '';
  return parts.map((part) => {
    acc += `/${part}`;
    return { label: humanize(part), href: acc };
  });
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const pathname = usePathname();
  const trail = items ?? deriveFromPathname(pathname ?? '');

  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1.5 text-sm', className)}>
      <Link
        href="/dashboard"
        className="flex items-center transition-colors text-muted-foreground hover:text-foreground"
        aria-label="Dashboard home"
      >
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
      {trail.map((segment, index) => {
        const isLast = index === trail.length - 1;
        return (
          <React.Fragment key={`${segment.label}-${index}`}>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {segment.href && !isLast ? (
              <Link
                href={segment.href}
                className="truncate transition-colors max-w-40 text-muted-foreground hover:text-foreground sm:max-w-none"
              >
                {segment.label}
              </Link>
            ) : (
              <span className="font-medium truncate max-w-40 text-foreground sm:max-w-none" aria-current="page">
                {segment.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}