
// frontend/shared/ui/navigation/CommandPalette.tsx
//
// Global Ctrl/Cmd+K command palette. Fuzzy-filters a static command
// list (navigation, theme, account) client-side. Kept as a self-contained
// overlay (no portal) for the same reasons NestedMenu.tsx is
// self-contained: it needs to work regardless of the exact API shape of
// unseen shadcn primitives.

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard,
  Truck,
  Route,
  Fuel as FuelIcon,
  Wallet,
  Wrench,
  Building2,
  ShieldCheck,
  Settings,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Search as SearchIcon,
  FileBarChart,
  LineChart,
  Users,
} from 'lucide-react';
import { Permission, permissionService } from '@/server/permissions/roles';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useUiStore } from '@/frontend/shared/store/ui.store';
import { cn } from '@/lib/utils';

interface CommandEntry {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string[];
  /**
   * FIX (Phase E, objective 4 -- "frontend visibility: permission driven").
   * The palette previously offered EVERY route to EVERY authenticated
   * user. A driver could press Ctrl+K and jump straight to Organization
   * Settings or the Audit Log. The API rejects the resulting calls, so
   * this was never a data breach -- but it advertised the whole admin
   * surface to users with no business seeing it, and produced a trail of
   * 403s that read as bugs.
   *
   * Gated on the same Permission members as the sidebar and the API
   * routes, resolved through the same permissionService. Omit to show an
   * entry to every authenticated user.
   */
  permission?: Permission[];
}

export function CommandPalette() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const trackVisit = useUiStore((s) => s.trackVisit);

  const [query, setQuery] = React.useState('');
  const sessionUser = useSessionStore((state) => state.user);
  const roles = React.useMemo(() => sessionUser?.roles ?? [], [sessionUser]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const navigate = React.useCallback(
    (href: string, label: string) => {
      trackVisit({ path: href, label });
      router.push(href);
      setOpen(false);
    },
    [router, setOpen, trackVisit]
  );

  const allCommands: CommandEntry[] = React.useMemo(
    () => [
      { id: 'nav-dashboard', label: 'Go to Dashboard', group: 'Navigate', icon: LayoutDashboard, action: () => navigate('/dashboard', 'Dashboard') },
      { id: 'nav-vehicles', label: 'Go to Vehicles', group: 'Navigate', icon: Truck, permission: [Permission.VEHICLE_VIEW], action: () => navigate('/vehicles', 'Vehicles') },
      { id: 'nav-drivers', label: 'Go to Drivers', group: 'Navigate', icon: Users, permission: [Permission.VEHICLE_VIEW], action: () => navigate('/drivers', 'Drivers') },
      { id: 'nav-trips', label: 'Go to Trips', group: 'Navigate', icon: Route, permission: [Permission.TRIP_VIEW, Permission.DRIVER_VIEW_TRIPS], action: () => navigate('/trips', 'Trips') },
      { id: 'nav-trips-analytics', label: 'Go to Trip Analytics', group: 'Navigate', icon: LineChart, permission: [Permission.TRIP_VIEW], action: () => navigate('/trips/analytics', 'Trip Analytics') },
      { id: 'nav-fuel', label: 'Go to Fuel', group: 'Navigate', icon: FuelIcon, permission: [Permission.FUEL_VIEW], action: () => navigate('/fuel', 'Fuel') },
      { id: 'nav-fuel-stations', label: 'Go to Fuel Stations', group: 'Navigate', icon: FuelIcon, permission: [Permission.FUEL_VIEW], action: () => navigate('/fuel/stations', 'Fuel Stations') },
      { id: 'nav-fuel-cards', label: 'Go to Fuel Cards', group: 'Navigate', icon: FuelIcon, permission: [Permission.FUEL_VIEW], action: () => navigate('/fuel/cards', 'Fuel Cards') },
      { id: 'nav-fuel-analytics', label: 'Go to Fuel Analytics', group: 'Navigate', icon: LineChart, permission: [Permission.FUEL_VIEW], action: () => navigate('/fuel/analytics', 'Fuel Analytics') },
      { id: 'nav-expenses', label: 'Go to Expenses', group: 'Navigate', icon: Wallet, permission: [Permission.EXPENSE_VIEW], action: () => navigate('/expenses', 'Expenses') },
      { id: 'nav-expenses-analytics', label: 'Go to Expense Analytics', group: 'Navigate', icon: LineChart, permission: [Permission.EXPENSE_VIEW], action: () => navigate('/expenses/analytics', 'Expense Analytics') },
      { id: 'nav-maintenance', label: 'Go to Maintenance', group: 'Navigate', icon: Wrench, permission: [Permission.MAINTENANCE_VIEW], action: () => navigate('/maintenance', 'Maintenance') },
      { id: 'nav-maintenance-overdue', label: 'Go to Overdue Maintenance', group: 'Navigate', icon: Wrench, permission: [Permission.MAINTENANCE_VIEW], action: () => navigate('/maintenance/overdue', 'Overdue Maintenance') },
      { id: 'nav-maintenance-calendar', label: 'Go to Maintenance Calendar', group: 'Navigate', icon: Wrench, permission: [Permission.MAINTENANCE_VIEW], action: () => navigate('/maintenance/calendar', 'Maintenance Calendar') },
      { id: 'nav-reports', label: 'Go to Reports', group: 'Navigate', icon: FileBarChart, permission: [Permission.REPORT_VIEW], action: () => navigate('/reports', 'Reports') },
      { id: 'nav-reports-builder', label: 'Go to Report Builder', group: 'Navigate', icon: FileBarChart, permission: [Permission.REPORT_CREATE], action: () => navigate('/reports/builder', 'Report Builder') },
      { id: 'nav-analytics', label: 'Go to Analytics', group: 'Navigate', icon: LineChart, permission: [Permission.ANALYTICS_VIEW], action: () => navigate('/organizations/analytics', 'Analytics') },
      { id: 'nav-org', label: 'Go to Organization Dashboard', group: 'Navigate', icon: Building2, permission: [Permission.ORG_VIEW], action: () => navigate('/organizations/dashboard', 'Organization') },
      { id: 'nav-org-members', label: 'Go to Members', group: 'Navigate', icon: Users, permission: [Permission.ORG_MEMBERS_MANAGE], action: () => navigate('/organizations/members', 'Members') },
      { id: 'nav-audit-log', label: 'Go to Audit Log', group: 'Navigate', icon: ShieldCheck, permission: [Permission.AUDIT_LOG_VIEW], action: () => navigate('/organizations/audit-log', 'Audit Log') },
      { id: 'nav-settings', label: 'Go to Organization Settings', group: 'Navigate', icon: Settings, permission: [Permission.ORG_MANAGE], action: () => navigate('/organizations/settings', 'Settings') },
      { id: 'theme-light', label: 'Switch to Light theme', group: 'Theme', icon: Sun, keywords: ['appearance'], action: () => { setTheme('light'); setOpen(false); } },
      { id: 'theme-dark', label: 'Switch to Dark theme', group: 'Theme', icon: Moon, keywords: ['appearance'], action: () => { setTheme('dark'); setOpen(false); } },
      { id: 'theme-system', label: 'Match System theme', group: 'Theme', icon: Monitor, keywords: ['appearance'], action: () => { setTheme('system'); setOpen(false); } },
      { id: 'sign-out', label: 'Sign out', group: 'Account', icon: LogOut, action: () => { setOpen(false); void signOut({ callbackUrl: '/auth/login' }); } },
    ],
    [navigate, setOpen, setTheme]
  );

  /**
   * Permission gate, applied before search. Entries the user cannot use
   * are not merely hidden from results -- they never enter the list, so
   * they cannot be reached by typing an exact match either.
   */
  const commands = React.useMemo(
    () =>
      allCommands.filter(
        (c) => !c.permission || permissionService.hasAnyPermission(roles, c.permission)
      ),
    [allCommands, roles]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const haystack = [c.label, c.group, ...(c.keywords ?? [])].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [commands, query]);

  const grouped = React.useMemo(() => {
    const groups = new Map<string, CommandEntry[]>();
    for (const command of filtered) {
      if (!groups.has(command.group)) groups.set(command.group, []);
      groups.get(command.group)!.push(command);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  React.useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const isModK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isModK) {
        event.preventDefault();
        setOpen(!open);
      }
      if (event.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [open, setOpen]);

  React.useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(timer);
    }
  }, [open]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  React.useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      filtered[activeIndex]?.action();
    }
  }

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh] backdrop-blur-xs"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
        className="w-full overflow-hidden border shadow-xl max-w-form-wide animate-slide-up rounded-xl border-border bg-popover text-popover-foreground"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <SearchIcon className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            aria-label="Command search"
            className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div className="p-2 overflow-y-auto max-h-96">
          {filtered.length === 0 ? (
            <p className="px-2 py-8 text-sm text-center text-muted-foreground">No matching commands.</p>
          ) : (
            grouped.map(([group, entries]) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-2 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </p>
                {entries.map((entry) => {
                  runningIndex += 1;
                  const isActive = runningIndex === activeIndex;
                  const Icon = entry.icon;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(runningIndex)}
                      onClick={entry.action}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors',
                        isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {entry.label}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}