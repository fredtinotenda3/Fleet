
// app/(protected)/reports/layout.tsx
//
// FIX (Critical — "TypeError: item.match is not a function" crashing the
// entire Reports section): REPORT_NAV_ITEMS stored a `match` FUNCTION per
// entry and called `item.match(pathname ?? '')` directly. Any situation
// where that property isn't a live function reference at runtime — a stale
// build chunk after this file changed, a bundler/HMR edge case, or any
// future refactor that serializes this array — throws immediately and
// error.tsx catches it, blanking the whole Reports Center (Executive
// Dashboard included) behind a chunk-level TypeError with no useful stack.
//
// Root-caused by removing the function entirely: each nav item now carries
// a plain, serializable `pattern` string + `exact` boolean, and matching is
// computed by a small local helper. There is no function reference stored
// in the array anymore, so this class of failure structurally cannot recur
// here. (If the underlying cause turns out to be a stale dev build, a
// `rm -rf .next` + restart is still worth doing — but this fix holds either
// way.)

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { REPORTS_ROUTES } from '@/frontend/modules/reports/routes';
import { cn } from '@/lib/utils';

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

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';

  return (
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
  );
}