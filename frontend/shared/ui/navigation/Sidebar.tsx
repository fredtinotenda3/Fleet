// frontend/shared/ui/navigation/Sidebar.tsx
//
// The navigation MODEL lives in ./nav.config.ts — including the security
// contract governing what may appear here. This file is presentation only.

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronsLeft, ChevronsRight, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/frontend/shared/store/ui.store';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { OrganizationAdvancedNavLinks } from '@/frontend/modules/organizations/components/nav/OrganizationAdvancedNavLinks';
import { permissionService } from '@/server/permissions/roles';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/frontend/shared/ui/navigation/tooltip';
import {
  isActivePath,
  isItemActive,
  visibleSections,
  type NavItem,
} from './nav.config';

const hasAnyPermission = (roles: string[], permissions: Parameters<typeof permissionService.hasAnyPermission>[1]) =>
  permissionService.hasAnyPermission(roles, permissions);

interface SidebarNavContentProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

function NavRow({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const navExpanded = useUiStore((s) => s.navExpanded);
  const setNavExpanded = useUiStore((s) => s.setNavExpanded);

  const Icon = item.icon;
  const active = isActivePath(pathname, item.href);
  const sectionActive = isItemActive(pathname, item);
  const children = item.children ?? [];
  const hasChildren = children.length > 0;

  // Default open when the current route is inside this item; an explicit
  // user choice always wins. See the note on `navExpanded` in ui.store.ts
  // for why this is a tri-state rather than a set of open keys.
  const userChoice = navExpanded[item.key];
  const expanded = hasChildren && !collapsed && (userChoice ?? sectionActive);

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-md py-2 text-body-sm transition-colors',
        collapsed ? 'justify-center px-0' : 'px-2.5',
        // The left accent bar finally uses --sidebar-active, a token that
        // has been defined in globals.css since the palette was written and
        // referenced by nothing. Background alone was a weak active signal
        // against the dark sidebar.
        active
          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
          : sectionActive
            ? 'text-sidebar-accent-foreground hover:bg-sidebar-accent/60'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
      )}
    >
      {active && (
        <span
          className="absolute inset-y-1 left-0 w-0.5 rounded-r-full bg-[var(--sidebar-active)]"
          aria-hidden="true"
        />
      )}
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  return (
    <div>
      <div className="flex items-center">
        <div className="min-w-0 flex-1">
          {collapsed ? (
            // Portal-rendered tooltip rather than the browser's `title`
            // attribute: the native one takes ~1s to appear and cannot show
            // the hint line, which makes a collapsed icon rail guesswork.
            <Tooltip>
              <TooltipTrigger render={link as React.ReactElement} />
              <TooltipContent side="right" sideOffset={8}>
                <span className="font-medium">{item.label}</span>
                {item.hint && <span className="text-background/70">— {item.hint}</span>}
              </TooltipContent>
            </Tooltip>
          ) : (
            link
          )}
        </div>

        {hasChildren && !collapsed && (
          <button
            type="button"
            onClick={() => setNavExpanded(item.key, !expanded)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.label} sub-navigation`}
            className="ml-0.5 flex size-6 shrink-0 items-center justify-center rounded text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform duration-150', expanded && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-0.5 ml-[1.0625rem] space-y-0.5 border-l border-sidebar-border pl-3">
          {children.map((child) => {
            const childActive = isActivePath(pathname, child.href);
            return (
              <Link
                key={child.key}
                href={child.href}
                onClick={onNavigate}
                aria-current={childActive ? 'page' : undefined}
                className={cn(
                  'block truncate rounded-md px-2.5 py-1.5 text-caption transition-colors',
                  childActive
                    ? 'bg-sidebar-accent/70 font-medium text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground'
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SidebarNavContent({ collapsed = false, onNavigate }: SidebarNavContentProps) {
  const pathname = usePathname() ?? '';
  const user = useSessionStore((s) => s.user);
  const roles = React.useMemo(() => user?.roles ?? [], [user?.roles]);

  const sections = React.useMemo(
    () => visibleSections(roles, hasAnyPermission),
    [roles]
  );

  return (
    <TooltipProvider delay={200}>
      <div className="flex h-full flex-col overflow-y-auto py-3">
        <div className={cn('flex items-center gap-2.5 pb-4', collapsed ? 'justify-center px-0' : 'px-3')}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Truck className="size-4" aria-hidden="true" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-sidebar-accent-foreground">Fleet Intelligence</p>
              <p className="truncate text-caption text-sidebar-foreground/60">Operations platform</p>
            </div>
          )}
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-4 px-2">
          {sections.map((section, index) => (
            <div key={section.id}>
              {collapsed ? (
                // A hairline instead of a heading, so the icon rail keeps its
                // grouping. Without it the icons run together as one list and
                // the information architecture disappears on collapse.
                index > 0 && <div className="mx-2 mb-2 border-t border-sidebar-border" aria-hidden="true" />
              ) : (
                <p className="px-2 pb-1 text-caption font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavRow
                    key={item.key}
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          ))}

          {!collapsed && (
            <div className="border-t border-sidebar-border pt-2">
              <OrganizationAdvancedNavLinks />
            </div>
          )}
        </nav>
      </div>
    </TooltipProvider>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-150 lg:flex lg:flex-col',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="min-h-0 flex-1">
        <SidebarNavContent collapsed={collapsed} />
      </div>
      <div className="border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && <span className="text-caption">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
