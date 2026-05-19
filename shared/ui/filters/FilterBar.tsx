// shared/ui/filters/FilterBar.tsx

'use client';

import { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchClear?: () => void;
  filters?: ReactNode;
  additionalActions?: ReactNode;
  className?: string;
}

export function FilterBar({
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  onSearchClear,
  filters,
  additionalActions,
  className,
}: FilterBarProps) {
  return (
    <div className={cn('flex flex-col gap-4 md:flex-row md:items-center md:justify-between', className)}>
      <div className="flex flex-1 items-center gap-2">
        <div className="relative flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchValue && onSearchClear && (
            <button
              onClick={onSearchClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {filters && <div className="hidden md:block">{filters}</div>}
      </div>

      <div className="flex items-center gap-2">
        {filters && (
          <div className="md:hidden">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>
        )}
        {additionalActions}
      </div>
    </div>
  );
}