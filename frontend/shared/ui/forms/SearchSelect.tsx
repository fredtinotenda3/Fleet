// frontend/shared/ui/forms/SearchSelect.tsx
//
// OLIVINE LIVE OPERATING MODEL, SLICE 4 (Command Centre). An ID-based
// search combobox -- built from the SAME Command/Popover primitives as
// SearchCreateSelect.tsx (see that file's own header for why: cmdk's
// keyboard navigation needs the search input inside the opened
// popover, not on an always-editable trigger), but deliberately a
// DIFFERENT component rather than a SearchCreateSelect variant.
//
// SearchCreateSelect's committed `value` IS the display label -- correct
// for a field where the underlying data IS a free-text string
// (customerName, destinationTown). A Command Centre vehicle/transporter
// FILTER is not that: the value the rest of the app needs is an opaque
// id (contractedVehicleId / transporterPartnerId), and closing the
// popover without an explicit selection must NEVER commit typed free
// text as if it were a valid id -- an unmatched id would silently
// filter to "nothing" rather than surface as the typing-in-progress it
// actually is. So this component only ever calls `onChange` from an
// explicit selection (or an explicit "Clear filter"), never from
// closing with leftover query text.

'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/shared/ui/navigation/popover';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from '@/frontend/shared/ui/navigation/command';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Label } from './label';
import { cn } from '@/lib/utils';

export interface SearchSelectResult {
  id: string;
  label: string;
}

/**
 * PRODUCTION FIX (Slice 1-5 verification pass). `search()` used to
 * resolve a bare array, capped server-side with no signal more rows
 * existed -- see modules/transport-cost/services/master-data.service.ts's
 * MasterDataSearchPage doc comment for the full reasoning (this
 * component is used for the Command Centre's Vehicle/Transporter filters
 * and the review queue's alternative-transporter picker, both backed by
 * the same search endpoints).
 */
export interface SearchSelectPage {
  results: SearchSelectResult[];
  hasMore: boolean;
}

export interface SearchSelectProps {
  id?: string;
  label?: string;
  placeholder?: string;
  /** The committed id, or undefined when no filter is applied. */
  value: string | undefined;
  /** The display label for the currently committed id, if known (the caller already has it from a prior search result or resolved display data). Falls back to the raw id when absent. */
  valueLabel?: string;
  onChange: (value: string | undefined) => void;
  /** Server-side type-ahead lookup. Resolves a page, not a bare array -- see SearchSelectPage. */
  search: (query: string) => Promise<SearchSelectPage>;
  disabled?: boolean;
}

const DEBOUNCE_MS = 220;

export function SearchSelect({ id, label, placeholder = 'Search…', value, valueLabel, onChange, search, disabled }: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<SearchSelectResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    search(debouncedQuery.trim())
      .then((page) => {
        if (cancelled || requestIdRef.current !== requestId) return;
        setResults(page.results);
        setHasMore(page.hasMore);
      })
      .catch((err: unknown) => {
        if (cancelled || requestIdRef.current !== requestId) return;
        setError(err instanceof Error ? err.message : 'Search failed.');
        setResults([]);
        setHasMore(false);
      })
      .finally(() => {
        if (cancelled || requestIdRef.current !== requestId) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `search` is expected to be referentially stable.
  }, [debouncedQuery, open]);

  function handleOpenChange(next: boolean) {
    if (next) {
      setQuery('');
      setDebouncedQuery('');
      setError(null);
    }
    setOpen(next);
  }

  function selectResult(result: SearchSelectResult) {
    onChange(result.id);
    setOpen(false);
  }

  const displayValue = value ? valueLabel ?? value : '';

  return (
    <div>
      {label && <Label htmlFor={id} className="form-label">{label}</Label>}
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger
            render={
              <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal">
                <span className={cn('truncate text-left', !value && 'text-muted-foreground')}>{displayValue || placeholder}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            }
          />
          <PopoverContent className="w-[--anchor-width] min-w-64 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
              <CommandList>
                {loading && (
                  <div className="flex items-center gap-2 px-3 py-3 text-caption text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Searching…
                  </div>
                )}
                {!loading && results.length === 0 && <CommandEmpty>No matches.</CommandEmpty>}
                {!loading && results.length > 0 && (
                  <CommandGroup>
                    {results.map((r) => (
                      <CommandItem key={r.id} value={r.id} onSelect={() => selectResult(r)}>
                        <Check className={cn('h-3.5 w-3.5', r.id === value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                        {r.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
            {!loading && !error && hasMore && (
              <p className="border-t border-border px-3 py-1.5 text-caption text-muted-foreground">
                Showing the first {results.length} matches — keep typing to narrow the results.
              </p>
            )}
            {error && <p className="border-t border-border px-3 py-1.5 text-caption text-destructive">{error}</p>}
          </PopoverContent>
        </Popover>
        {value && (
          <Button type="button" variant="ghost" size="sm" aria-label={`Clear ${label ?? 'filter'}`} onClick={() => onChange(undefined)}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
