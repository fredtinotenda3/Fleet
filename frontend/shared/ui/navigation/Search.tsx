
// frontend/shared/ui/navigation/Search.tsx
//
// "Search Everywhere" trigger for the TopBar. Opens the global
// CommandPalette rather than implementing its own search UI, so there
// is exactly one search surface in the app.

'use client';

import * as React from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { useUiStore } from '@/frontend/shared/store/ui.store';
import { cn } from '@/lib/utils';

interface SearchProps {
  className?: string;
  compact?: boolean;
}

export function Search({ className, compact = false }: SearchProps) {
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const [isMac, setIsMac] = React.useState(false);

  React.useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(window.navigator.platform));
  }, []);

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        aria-label="Search"
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          className
        )}
      >
        <SearchIcon className="w-4 h-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setCommandPaletteOpen(true)}
      className={cn(
        'flex h-8 w-full max-w-72 items-center gap-2 rounded-md border border-input bg-surface px-2.5 text-left text-body-sm text-muted-foreground transition-colors hover:border-slate-300 hover:text-foreground',
        className
      )}
    >
      <SearchIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate">Search everywhere&hellip;</span>
      <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground sm:inline-block">
        {isMac ? '\u2318K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}