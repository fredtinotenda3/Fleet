// frontend/shared/ui/forms/SearchCreateSelect.tsx
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. "Search existing, or + Add
// New" combobox for master-data fields (Customer, Destination,
// Transporter, Truck registration) -- the client's own required UX:
// "Search existing value -> Select existing record OR + Add New ->
// Create master/reference record -> Immediately select it in the
// current form."
//
// Built from this codebase's EXISTING Command/Popover primitives
// (frontend/shared/ui/navigation/{command,popover}.tsx), the same two
// components Autocomplete.tsx already composes for a closed-list
// combobox -- per the client's own "Use the application's existing
// Select/Combobox/Command patterns if available" instruction. This is
// NOT built on top of Autocomplete.tsx itself: that component's option
// list is a fixed, fully-known array with zero existing callers (pure
// unused scaffolding), whereas this one needs an ASYNC, server-searched,
// debounced list plus an optional create action -- different enough
// shape that copying Autocomplete's own JSX structure (trigger Button +
// CommandInput inside the popover) was the right level of reuse, not
// wrapping it.
//
// WHY A CommandInput INSIDE THE POPOVER, NOT AN EDITABLE TRIGGER
// ---------------------------------------------------------------------
// An earlier draft made the trigger itself a live-editable <Input>, so
// the box you see before opening anything is also the box you type
// into (closer to the spec's own "Search destination... ▼" ASCII
// mockup). That loses cmdk's own keyboard navigation: cmdk's up/down/
// Enter handling listens within the <Command> element's own DOM
// subtree, and the always-visible trigger lives in a different subtree
// (the Popover's anchor, not its content) from the CommandList showing
// results. Typing in the trigger would show a dropdown that arrow keys
// and Enter could not actually drive. Following Autocomplete.tsx's own
// working pattern instead -- a button-styled trigger showing the
// current value, with the real (cmdk) search input living inside the
// opened popover -- keeps full keyboard support and is the pattern this
// codebase has already used successfully for this class of picker.
//
// WHY FREE TEXT STILL WORKS (not a closed-set Select)
// ---------------------------------------------------------------------
// The client's requirement is explicit: "without uncontrolled free-text
// duplication" is about steering toward reuse, not FORBIDDING free
// text -- customerName/destinationTown/transporterRaw/registrationRaw
// remain plain strings on the underlying record (see this slice's
// master-data.service.ts header: "the master-data layer sits in front
// of the existing data model", never replacing it). So closing the
// popover WITHOUT picking a result or "+ Add New" still commits
// whatever text was typed, via `onChange`, exactly like the plain
// <Input> this component replaces. That typed text still flows through
// the unmodified O1/O2 pipeline for Transporter/Vehicle, or becomes a
// new Customer/Destination the next time it's submitted through '+ Add
// New' (or is left as free text forever, same as pre-Slice-3) -- no
// behaviour is newly forbidden, only newly assisted.

'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/shared/ui/navigation/popover';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from '@/frontend/shared/ui/navigation/command';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Label } from './label';
import { cn } from '@/lib/utils';

export interface SearchCreateSelectResult {
  id: string;
  label: string;
}

/**
 * PRODUCTION FIX (Slice 1-5 verification pass). `search()` used to
 * resolve a bare array, capped server-side with no signal that more
 * rows existed beyond the cap -- the root cause of the reported "the
 * form only shows the first ~20 records" defect. `hasMore` lets this
 * component render "keep typing to narrow" instead of presenting a
 * truncated page as if it were complete. See
 * modules/transport-cost/services/master-data.service.ts's
 * MasterDataSearchPage doc comment for the backend side of this fix.
 */
export interface SearchCreateSelectPage {
  results: SearchCreateSelectResult[];
  hasMore: boolean;
}

export interface SearchCreateSelectProps {
  id?: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  /** The committed value -- a plain string, exactly like the free-text field this replaces. */
  value: string;
  onChange: (value: string) => void;
  /** Server-side type-ahead lookup. Called with the trimmed query text, ~220ms after the operator stops typing. Resolves a page, not a bare array -- see SearchCreateSelectPage. */
  search: (query: string) => Promise<SearchCreateSelectPage>;
  /** Present only for fields where creating a new master-data record synchronously is safe (Customer, Destination). Omitted for Transporter/Truck registration -- see this file's header and master-data.service.ts's. */
  onCreateNew?: (name: string) => Promise<SearchCreateSelectResult>;
  /** Overrides the column label in the "+ Add New ..." action and empty-state copy. */
  createLabel?: string;
  disabled?: boolean;
}

const DEBOUNCE_MS = 220;

export function SearchCreateSelect({
  id,
  label,
  required,
  placeholder = 'Search…',
  value,
  onChange,
  search,
  onCreateNew,
  createLabel,
  disabled,
}: SearchCreateSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [debouncedQuery, setDebouncedQuery] = useState(value);
  const [results, setResults] = useState<SearchCreateSelectResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `search` is expected to be referentially stable (a bound api-client method); re-running on every render would defeat debouncing.
  }, [debouncedQuery, open]);

  function handleOpenChange(next: boolean) {
    if (next) {
      // Start each opening from the currently committed value, not
      // whatever was left over from a previous open-then-cancel.
      setQuery(value);
      setDebouncedQuery(value);
      setError(null);
    } else {
      // Closing without an explicit selection still commits typed free
      // text -- see this file's header.
      const trimmed = query.trim();
      if (trimmed !== value) onChange(trimmed);
    }
    setOpen(next);
  }

  function selectResult(result: SearchCreateSelectResult) {
    setQuery(result.label);
    onChange(result.label);
    setOpen(false);
  }

  async function handleCreateNew() {
    const name = query.trim();
    if (!name || !onCreateNew || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await onCreateNew(name);
      selectResult(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this record.');
    } finally {
      setCreating(false);
    }
  }

  const trimmedQuery = query.trim();
  // Skip the "+ Add New" action when the exact name (case-insensitive)
  // is already sitting right there in the results -- selecting it is
  // strictly better than inviting a near-duplicate at that moment.
  const exactMatchExists = results.some((r) => r.label.trim().toLowerCase() === trimmedQuery.toLowerCase());
  const showCreateOption = Boolean(onCreateNew) && trimmedQuery.length > 0 && !exactMatchExists;
  const createActionLabel = createLabel ?? label ?? 'record';

  return (
    <div>
      {label && (
        <Label htmlFor={id} className={required ? 'form-label form-required' : 'form-label'}>
          {label}
        </Label>
      )}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className="w-full justify-between font-normal"
            >
              <span className={cn('truncate text-left', !value && 'text-muted-foreground')}>
                {value || placeholder}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          }
        />
        <PopoverContent className="w-[--anchor-width] min-w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={placeholder}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {loading && (
                <div className="flex items-center gap-2 px-3 py-3 text-caption text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Searching…
                </div>
              )}
              {!loading && results.length === 0 && !showCreateOption && (
                <CommandEmpty>No matches.</CommandEmpty>
              )}
              {!loading && results.length > 0 && (
                <CommandGroup>
                  {results.map((r) => (
                    <CommandItem key={r.id} value={r.id} onSelect={() => selectResult(r)}>
                      <Check className={cn('h-3.5 w-3.5', r.label === value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                      {r.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showCreateOption && (
                <CommandGroup>
                  <CommandItem
                    value={`__create__${trimmedQuery}`}
                    onSelect={handleCreateNew}
                    disabled={creating}
                  >
                    {creating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Add New {createActionLabel} &ldquo;{trimmedQuery}&rdquo;
                  </CommandItem>
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
    </div>
  );
}
