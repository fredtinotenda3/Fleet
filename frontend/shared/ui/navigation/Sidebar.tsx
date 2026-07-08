// frontend/shared/ui/navigation/Sidebar.tsx

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Truck,
  Route,
  Fuel as FuelIcon,
  Wallet,
  Wrench,
  ClipboardList,
  Warehouse,
  Boxes,
  ShoppingCart,
  Building2,
  ShieldCheck,
  Timer,
  FileBarChart,
  LineChart,
  Users,
  Shield,
  KeyRound,
  ScrollText,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Truck as TruckIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/frontend/shared/store/ui.store';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { OrganizationAdvancedNavLinks } from '@/frontend/modules/organizations/components/nav/OrganizationAdvancedNavLinks';

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [{ key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Fleet',
    items: [
      { key: 'vehicles', label: 'Vehicles', href: '/vehicles', icon: Truck },
      { key: 'trips', label: 'Trips', href: '/trips', icon: Route },
      { key: 'fuel', label: 'Fuel Logs', href: '/fuel', icon: FuelIcon },
      { key: 'expenses', label: 'Expenses', href: '/expenses', icon: Wallet },
      { key: 'maintenance', label: 'Maintenance', href: '/maintenance', icon: Wrench },
    ],
  },
  {
    title: 'Operations',
    items: [
      { key: 'dispatch', label: 'Dispatch', href: '/dispatch', icon: ClipboardList },
      { key: 'workshop', label: 'Workshop', href: '/workshop', icon: Warehouse },
      { key: 'inventory', label: 'Inventory', href: '/inventory', icon: Boxes },
      { key: 'procurement', label: 'Procurement', href: '/procurement', icon: ShoppingCart },
      { key: 'vendors', label: 'Vendors', href: '/vendors', icon: Building2 },
      { key: 'compliance', label: 'Compliance', href: '/compliance', icon: ShieldCheck },
      { key: 'sla', label: 'SLA Policies', href: '/sla', icon: Timer },
    ],
  },
  {
    title: 'Insights',
    items: [
      { key: 'reports', label: 'Reports', href: '/reports', icon: FileBarChart },
      { key: 'analytics', label: 'Organization Analytics', href: '/organizations/analytics', icon: LineChart, roles: ['organization_owner', 'fleet_manager'] },
    ],
  },
  {
    title: 'Organization',
    items: [
      { key: 'org-dashboard', label: 'Overview', href: '/organizations/dashboard', icon: Building2 },
      { key: 'members', label: 'Members', href: '/organizations/members', icon: Users, roles: ['organization_owner', 'fleet_manager'] },
      { key: 'roles', label: 'Roles & Permissions', href: '/organizations/roles', icon: Shield, roles: ['organization_owner', 'fleet_manager'] },
      { key: 'teams', label: 'Teams & Branches', href: '/organizations/teams', icon: Warehouse, roles: ['organization_owner', 'fleet_manager'] },
    ],
  },
  {
    title: 'Security',
    items: [
      { key: 'sessions', label: 'My Sessions', href: '/auth/sessions', icon: MonitorIconWrapper },
      { key: 'api-keys', label: 'API Keys', href: '/organizations/advanced?tab=plugins', icon: KeyRound, roles: ['organization_owner'] },
      { key: 'org-audit', label: 'Audit Log', href: '/organizations/audit-log', icon: ScrollText, roles: ['organization_owner', 'fleet_manager', 'auditor'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { key: 'org-settings', label: 'Organization Settings', href: '/organizations/settings', icon: Settings, roles: ['organization_owner', 'fleet_manager'] },
      { key: 'org-advanced', label: 'Advanced', href: '/organizations/advanced', icon: Settings, roles: ['organization_owner', 'fleet_manager'] },
    ],
  },
];

function MonitorIconWrapper({ className }: { className?: string }) {
  return <TruckIcon className={className} style={{ display: 'none' }} aria-hidden="true" />;
}

function isItemVisible(item: NavItem, roles: string[]): boolean {
  if (!item.roles || item.roles.length === 0) return true;
  return item.roles.some((r) => roles.includes(r));
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarNavContentProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarNavContent({ collapsed = false, onNavigate }: SidebarNavContentProps) {
  const pathname = usePathname() ?? '';
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];

  return (
    <div className="flex flex-col h-full py-3 overflow-y-auto">
      <div className="flex items-center gap-2 px-3 pb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 bg-primary text-primary-foreground">
          <Truck className="w-4 h-4" aria-hidden="true" />
        </div>
        {!collapsed && (
          <span className="font-semibold truncate text-h3 text-sidebar-foreground">Fleet Platform</span>
        )}
      </div>

      <nav className="flex-1 px-2 space-y-4">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => isItemVisible(item, roles));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              {!collapsed && (
                <p className="px-2 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-sidebar-foreground/50">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActivePath(pathname, item.href);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                        collapsed && 'justify-center px-0',
                        active
                          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}

        {!collapsed && (
          <div className="pt-2 border-t border-sidebar-border">
            <OrganizationAdvancedNavLinks />
          </div>
        )}
      </nav>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar transition-all duration-150 lg:flex lg:flex-col',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex-1 overflow-hidden">
        <SidebarNavContent collapsed={collapsed} />
      </div>
      <div className="p-2 border-t border-sidebar-border">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center justify-center w-full gap-2 py-2 transition-colors rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
          {!collapsed && <span className="text-caption">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}