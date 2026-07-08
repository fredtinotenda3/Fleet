// frontend/modules/organizations/components/nav/OrganizationAdvancedNavLinks.tsx
//
// Drop-in nav section for the app Sidebar. Renders "Advanced settings",
// "Audit log", and "Analytics" links, gated to owners/fleet managers,
// and highlights the active route. Framework-agnostic markup (plain
// <Link>/<span>, no dependency on Sidebar's internal component API)
// so it can be embedded directly inside Sidebar.tsx's JSX tree wherever
// the existing Organizations nav section lives — e.g.:
//
//   import { OrganizationAdvancedNavLinks } from '@/frontend/modules/organizations/components/nav/OrganizationAdvancedNavLinks';
//   ...
//   <OrganizationAdvancedNavLinks />
//
// inside whatever <nav>/<ul> wraps the other Organizations sidebar
// entries (Dashboard, Members, Roles, Teams).

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { useCurrentOrganization } from '../../hooks/useCurrentOrganization';
import { getVisibleAdvancedAdminNavItems } from '../../nav';

export function OrganizationAdvancedNavLinks() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { currentUserRole, isLoading } = useCurrentOrganization(user?.id);

  if (isLoading || !currentUserRole) return null;

  const items = getVisibleAdvancedAdminNavItems(currentUserRole);
  if (items.length === 0) return null;

  return (
    <div className="mt-1 space-y-0.5">
      <p className="px-3 pt-3 pb-1 uppercase text-section-title text-muted-foreground">
        Administration
      </p>
      {items.map(({ key, href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={key}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              isActive
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-foreground hover:bg-muted'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}