// frontend/modules/transport-cost/components/IdentityPicker.tsx
//
// GAP-CLOSURE PASS, Objectives 2/3/5. An ID-committing sibling of
// frontend/shared/ui/forms/SearchCreateSelect.tsx, built from the same
// Command/Popover primitives with the same debounced-search/"+ Add new"
// UX -- but SearchCreateSelect deliberately commits a plain LABEL
// string (correct for customerName/destinationTown/transporterRaw,
// which really are free-text fields on the record). This component is
// for the two fields that are NOT free text once a record has been
// resolved: TransportCostSourceRecord.transporterPartnerId/
// contractedVehicleId are ID references ("-> TransportPartner._id" /
// "-> ContractedVehicle._id" -- see those fields' own doc comments),
// so a Correct-mode field for them needs to commit an id, not a label.
// Reusing SearchCreateSelect directly and post-hoc resolving its
// committed label back to an id would be lossy (two different
// transporters can share a label after a typo-fix) and fragile, so this
// is a deliberate, small fork rather than forcing an id shape through a
// component whose contract is "value is a string, full stop."
//
// The "+ Add new" action here is also semantically different: it does
// NOT create a confirmed record the way Customer/Destination's does --
// it REQUESTS one (reviewStatus: 'needs-review'), selectable immediately
// but visibly flagged pending until a human confirms it in the
// "Pending master data" review queue (see request-new-transporter
// .command.ts for the full decision record). That distinction is
// surfaced in the UI copy ("Request new", not "Add new") and via a
// pending badge on the current selection.

'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/shared/ui/navigation/popover';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from '@/frontend/shared/ui/navigation/command';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Label } from '@/frontend/shared/ui/forms/label';
import { cn } from '@/lib/utils';

export interface IdentityPickerResult {
  id: string;
  label: string;
  /** Present only when the result came from a request-new call, or from a listing that already knows review status (e.g. the pending-master-data queue). Absent for an ordinary search result -- search only ever returns confirmed rows (see MasterDataService's own header), so "confirmed" is implied. */
  reviewStatus?: 'auto-suggested' | 'confirmed' | 'needs-review';
}

/**
 * PRODUCTION FIX (Slice 1-5 verification pass, HIGH PRIORITY). `search()`
 * used to resolve a bare array capped server-side (originally 20) with
 * no signal more rows existed -- this is the exact defect reported as
 * "the production form appears to show only approximately 20
 * transporters." `hasMore` lets this component render "keep typing to
 * narrow" instead of presenting a truncated page as complete. See
 * modules/transport-cost/services/master-data.service.ts's
 * MasterDataSearchPage doc comment for the backend side of this fix.
 */
export interface IdentityPickerPage {
  results: IdentityPickerResult[];
  hasMore: boolean;
}

interface IdentityPickerProps {
  id?: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  /** The committed id -- empty string means "none selected". */
  value: string;
  /** The committed id's display label, kept by the caller alongside `value` (this component has no way to resolve an id back to a label on its own). */
  valueLabel?: string;
  /** True when the currently-selected identity is itself still needs-review -- shown as a pending badge next to the trigger. */
  valuePending?: boolean;
  onChange: (result: IdentityPickerResult | null) => void;
  /** Server-side type-ahead lookup. Resolves a page, not a bare array -- see IdentityPickerPage. */
  search: (query: string) => Promise<IdentityPickerPage>;
  /** Present only where requesting a new identity is safe/supported (Transporter, and Vehicle once a transporter is chosen). Omitted disables the "+ Request new" action entirely. */
  onRequestNew?: (rawInput: string) => Promise<IdentityPickerResult>;
  requestNewLabel?: string;
  disabled?: boolean;
  emptyHint?: string;
}

const DEBOUNCE_MS = 220;

export function IdentityPicker({
  id,
  label,
  required,
  placeholder = 'Search…',
  value,
  valueLabel,
  valuePending,
  onChange,
  search,
  onRequestNew,
  requestNewLabel,
  disabled,
  emptyHint,
}: IdentityPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<IdentityPickerResult[]>([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, open]);

  function handleOpenChange(next: boolean) {
    if (next) {
      setQuery('');
      setDebouncedQuery('');
      setError(null);
    }
    setOpen(next);
  }

  function selectResult(result: IdentityPickerResult) {
    onChange(result);
    setOpen(false);
  }

  async function handleRequestNew() {
    const raw = query.trim();
    if (!raw || !onRequestNew || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await onRequestNew(raw);
      selectResult(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request this identity.');
    } finally {
      setCreating(false);
    }
  }

  const trimmedQuery = query.trim();
  const exactMatchExists = results.some((r) => r.label.trim().toLowerCase() === trimmedQuery.toLowerCase());
  const showRequestNew = Boolean(onRequestNew) && trimmedQuery.length > 0 && !exactMatchExists;
  const actionLabel = requestNewLabel ?? label ?? 'identity';

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
              <span className={cn('flex items-center gap-2 truncate text-left', !value && 'text-muted-foreground')}>
                <span className="truncate">{value ? valueLabel || value : placeholder}</span>
                {value && valuePending && (
                  <Badge variant="outline" className="shrink-0 text-caption">
                    pending
                  </Badge>
                )}
              </span>
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
              {!loading && results.length === 0 && !showRequestNew && (
                <CommandEmpty>{emptyHint ?? 'No matches.'}</CommandEmpty>
              )}
              {!loading && results.length > 0 && (
                <CommandGroup>
                  {results.map((r) => (
                    <CommandItem key={r.id} value={r.id} onSelect={() => selectResult(r)}>
                      <Check className={cn('h-3.5 w-3.5', r.id === value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                      <span className="flex-1 truncate">{r.label}</span>
                      {r.reviewStatus === 'needs-review' && (
                        <Badge variant="outline" className="text-caption">
                          pending
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showRequestNew && (
                <CommandGroup>
                  <CommandItem value={`__request-new__${trimmedQuery}`} onSelect={handleRequestNew} disabled={creating}>
                    {creating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Request new {actionLabel} &ldquo;{trimmedQuery}&rdquo;
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
