// app/(protected)/reports/layout.tsx
//
// Shared shell for the entire Reports Center: sticky section nav across
// Executive Dashboard, Report Builder, Export Center, and Scheduled Reports.
// Matches the enterprise layout pattern already used by DashboardLayout.tsx.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { REPORTS_ROUTES } from '@/frontend/modules/reports/routes';
import { cn } from '@/lib/utils';

const REPORT_NAV_ITEMS = [
  { label: 'Executive Dashboard', href: REPORTS_ROUTES.executive, match: (p: string) => p === '/reports' },
  { label: 'Report Builder', href: REPORTS_ROUTES.builder.root, match: (p: string) => p.startsWith('/reports/builder') },
  { label: 'Export Center', href: REPORTS_ROUTES.exports, match: (p: string) => p.startsWith('/reports/exports') },
  { label: 'Scheduled Reports', href: REPORTS_ROUTES.scheduled, match: (p: string) => p.startsWith('/reports/scheduled') },
];

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <nav aria-label="Reports sections" className="flex gap-1 px-4 overflow-x-auto sm:px-6">
          {REPORT_NAV_ITEMS.map((item) => {
            const active = item.match(pathname ?? '');
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}