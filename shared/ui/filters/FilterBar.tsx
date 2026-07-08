// shared/ui/filters/FilterBar.tsx

'use client';

import { ReactNode } from 'react';
import { Input } from '@/frontend/shared/ui/forms/input'
import { Button } from '@/frontend/shared/ui/primitives/button'
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
      <div className="flex items-center flex-1 gap-2">
        <div className="relative flex-1 md:max-w-sm">
          <Search className="absolute w-4 h-4 -translate-y-1/2 left-3 top-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pr-8 pl-9"
          />
          {searchValue && onSearchClear && (
            <button
              onClick={onSearchClear}
              className="absolute -translate-y-1/2 right-3 top-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {filters && <div className="hidden md:block">{filters}</div>}
      </div>

      <div className="flex items-center gap-2">
        {filters && (
          <div className="md:hidden">
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        )}
        {additionalActions}
      </div>
    </div>
  );
}