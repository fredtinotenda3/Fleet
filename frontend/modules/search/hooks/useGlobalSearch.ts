// frontend/modules/search/hooks/useGlobalSearch.ts

'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/utils/api-client.utils';
import { isSearchable, type GlobalSearchResponse } from '../utils/search-results';

/**
 * Debounced record search for the command palette.
 *
 * 220 ms, and the number is not arbitrary: the palette is used by typing
 * a plate, so the request should fire once the operator has stopped
 * rather than once per keystroke. Six collections are queried per
 * request.
 */
const DEBOUNCE_MS = 220;

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export const searchKeys = {
  all: ['global-search'] as const,
  query: (q: string) => [...searchKeys.all, q] as const,
};

export function useGlobalSearch(rawQuery: string, options?: { enabled?: boolean }) {
  const query = useDebouncedValue(rawQuery.trim(), DEBOUNCE_MS);
  const enabled = (options?.enabled ?? true) && isSearchable(query);

  return useQuery({
    queryKey: searchKeys.query(query),
    queryFn: () => apiClient.get<GlobalSearchResponse>('/api/search', { params: { q: query } }),
    enabled,
    // Records change while the palette is open only rarely, and a stale
    // result is better than a spinner on a control the user is typing
    // into.
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    // The failure modes here (unauthenticated, a source that threw) are
    // deterministic; retrying just delays the footnote that explains
    // them.
    retry: 0,
  });
}
