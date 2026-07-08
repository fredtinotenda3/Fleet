
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
} from 'lucide-react';
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
}

export function CommandPalette() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const trackVisit = useUiStore((s) => s.trackVisit);

  const [query, setQuery] = React.useState('');
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

  const commands: CommandEntry[] = React.useMemo(
    () => [
      { id: 'nav-dashboard', label: 'Go to Dashboard', group: 'Navigate', icon: LayoutDashboard, action: () => navigate('/dashboard', 'Dashboard') },
      { id: 'nav-vehicles', label: 'Go to Vehicles', group: 'Navigate', icon: Truck, action: () => navigate('/vehicles', 'Vehicles') },
      { id: 'nav-trips', label: 'Go to Trips', group: 'Navigate', icon: Route, action: () => navigate('/trips', 'Trips') },
      { id: 'nav-fuel', label: 'Go to Fuel Logs', group: 'Navigate', icon: FuelIcon, action: () => navigate('/fuel', 'Fuel') },
      { id: 'nav-expenses', label: 'Go to Expenses', group: 'Navigate', icon: Wallet, action: () => navigate('/expenses', 'Expenses') },
      { id: 'nav-maintenance', label: 'Go to Maintenance', group: 'Navigate', icon: Wrench, action: () => navigate('/maintenance', 'Maintenance') },
      { id: 'nav-reports', label: 'Go to Reports', group: 'Navigate', icon: FileBarChart, action: () => navigate('/reports', 'Reports') },
      { id: 'nav-analytics', label: 'Go to Analytics', group: 'Navigate', icon: LineChart, action: () => navigate('/organizations/analytics', 'Analytics') },
      { id: 'nav-org', label: 'Go to Organization Dashboard', group: 'Navigate', icon: Building2, action: () => navigate('/organizations/dashboard', 'Organization') },
      { id: 'nav-security', label: 'Go to Account Security', group: 'Navigate', icon: ShieldCheck, action: () => navigate('/auth/account-security', 'Account Security') },
      { id: 'nav-settings', label: 'Go to Organization Settings', group: 'Navigate', icon: Settings, action: () => navigate('/organizations/settings', 'Settings') },
      { id: 'theme-light', label: 'Switch to Light theme', group: 'Theme', icon: Sun, keywords: ['appearance'], action: () => { setTheme('light'); setOpen(false); } },
      { id: 'theme-dark', label: 'Switch to Dark theme', group: 'Theme', icon: Moon, keywords: ['appearance'], action: () => { setTheme('dark'); setOpen(false); } },
      { id: 'theme-system', label: 'Match System theme', group: 'Theme', icon: Monitor, keywords: ['appearance'], action: () => { setTheme('system'); setOpen(false); } },
      { id: 'sign-out', label: 'Sign out', group: 'Account', icon: LogOut, action: () => { setOpen(false); void signOut({ callbackUrl: '/auth/login' }); } },
    ],
    [navigate, setOpen, setTheme]
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