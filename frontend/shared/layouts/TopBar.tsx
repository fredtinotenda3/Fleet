/* eslint-disable @typescript-eslint/no-unused-vars */
// frontend/shared/layouts/TopBar.tsx

'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/frontend/shared/ui/layout/sheet';
import { SidebarNavContent } from '@/frontend/shared/ui/navigation/Sidebar';
import { Search } from '@/frontend/shared/ui/navigation/Search';
import { Favorites } from '@/frontend/shared/ui/navigation/Favorites';
import { RecentlyViewed } from '@/frontend/shared/ui/navigation/RecentlyViewed';
import { ThemeToggle } from '@/frontend/shared/ui/feedback/ThemeToggle';
import { UserMenu } from '@/frontend/shared/ui/navigation/UserMenu';
import { NotificationCenter } from '@/frontend/shared/ui/feedback/NotificationCenter';
import { OrganizationSwitcher } from '@/frontend/modules/organizations/components/OrganizationSwitcher';
import { useCurrentOrganization } from '@/frontend/modules/organizations/hooks/useCurrentOrganization';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { apiClient } from '@/shared/utils/api-client.utils';
import { useUiStore } from '@/frontend/shared/store/ui.store';

interface NotificationApiItem {
  _id: string;
  title: string;
  message: string;
  read: boolean;
  sentAt: string;
}

interface NotificationsPage {
  data: NotificationApiItem[];
  pagination: { total: number };
}

function useTopBarNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: () => apiClient.get<NotificationsPage>('/api/notifications', { params: { page: 1, limit: 8 } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const markAsRead = useMutation({
    mutationFn: (id: string) => apiClient.put(`/api/notifications/${id}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'bell'] }),
  });

  const markAllAsRead = useMutation({
    mutationFn: () => apiClient.put('/api/notifications', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'bell'] }),
  });

  return { query, markAsRead, markAllAsRead };
}

export function TopBar() {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const { user } = useAuth();
  const { organizations, currentOrganizationId, switchOrganization, isLoading } = useCurrentOrganization(user?.id);
  const { query, markAsRead, markAllAsRead } = useTopBarNotifications();

  const notifications = (query.data?.data ?? []).map((n) => ({
    id: n._id,
    title: n.title,
    description: n.message,
    read: n.read,
    timestamp: new Date(n.sentAt).toLocaleString(),
  }));

  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 px-3 border-b h-14 shrink-0 border-border bg-surface sm:px-4">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation menu"
        className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="h-4.5 w-4.5" aria-hidden="true" />
      </button>

      <div className="hidden w-56 shrink-0 lg:block xl:w-64">
        <OrganizationSwitcher
          organizations={organizations}
          currentOrganizationId={currentOrganizationId}
          onSwitch={switchOrganization}
          isLoading={isLoading}
        />
      </div>

      <div className="flex-1">
        <Search className="mx-auto lg:mx-0" />
      </div>

      <div className="flex items-center gap-0.5">
        <div className="hidden items-center gap-0.5 sm:flex">
          <RecentlyViewed />
          <Favorites />
        </div>
        <ThemeToggle />
        <NotificationCenter
          notifications={notifications}
          onMarkAsRead={(id) => markAsRead.mutate(id)}
          onMarkAllAsRead={() => markAllAsRead.mutate()}
        />
        <div className="ml-1">
          <UserMenu />
        </div>
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNavContent onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}