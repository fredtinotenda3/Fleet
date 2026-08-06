// app/(protected)/reports/layout.tsx

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { REPORTS_ROUTES } from '@/frontend/modules/reports/routes';
import { cn } from '@/lib/utils';
import { PermissionGuard } from '@/frontend/shared/guards/PermissionGuard';
import { Permission } from '@/server/permissions/roles';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';

interface ReportNavItem {
  label: string;
  href: string;
  pattern: string;
  exact?: boolean;
}

const REPORT_NAV_ITEMS: ReportNavItem[] = [
  { label: 'Executive Dashboard', href: REPORTS_ROUTES.executive, pattern: '/reports', exact: true },
  { label: 'Report Builder', href: REPORTS_ROUTES.builder.root, pattern: '/reports/builder' },
  { label: 'AI Insights', href: '/reports/ai', pattern: '/reports/ai' },
  { label: 'Export Center', href: REPORTS_ROUTES.exports, pattern: '/reports/exports' },
  { label: 'Scheduled Reports', href: REPORTS_ROUTES.scheduled, pattern: '/reports/scheduled' },
];

function isNavItemActive(item: ReportNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.pattern;
  return pathname.startsWith(item.pattern);
}

/**
 * FIX (Phase E, task 2): this layout wrapped every /reports/* route
 * with zero permission check -- REPORT_VIEW only gated the Sidebar
 * link, not the route itself, so direct navigation reached a page
 * whose underlying queries would just fail. Wrapped in the (now
 * permission-based, see PermissionGuard.tsx) guard using the same
 * REPORT_VIEW permission as the Sidebar's Reports link, so the nav
 * link's visibility and the route's actual access can't diverge.
 */
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';

  return (
    <PermissionGuard
      permission={Permission.REPORT_VIEW}
      fallback={
        <div className="p-6">
          <EmptyState
            title="You don't have access to Reports"
            description="Reports and analytics aren't available for your role."
          />
        </div>
      }
    >
      <div className="flex flex-col">
        <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
          <nav aria-label="Reports sections" className="flex gap-1 px-4 overflow-x-auto sm:px-6">
            {REPORT_NAV_ITEMS.map((item) => {
              const active = isNavItemActive(item, pathname);
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
    </PermissionGuard>
  );
}