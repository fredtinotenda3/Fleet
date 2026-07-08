// frontend/shared/layouts/DashboardLayout.tsx

'use client';

import * as React from 'react';
import { Sidebar } from '@/frontend/shared/ui/navigation/Sidebar';
import { TopBar } from '@/frontend/shared/layouts/TopBar';
import { CommandPalette } from '@/frontend/shared/ui/navigation/CommandPalette';
import { ErrorBoundary } from '@/frontend/shared/errors/ErrorBoundary';
import { RouteGuard } from '@/frontend/shared/guards/RouteGuard';
import { useUiStore } from '@/frontend/shared/store/ui.store';
import { usePathname } from 'next/navigation';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const trackVisit = useUiStore((s) => s.trackVisit);

  React.useEffect(() => {
    if (pathname) {
      trackVisit({ path: pathname, label: document.title || pathname });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <RouteGuard>
      <div className="flex w-full min-h-screen bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar />
          <main className="flex-1 px-3 py-4 overflow-x-hidden sm:px-6 sm:py-6">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
      </div>
      <CommandPalette />
    </RouteGuard>
  );
}
