// frontend/modules/inventory/hooks/index.ts

import { useQuery } from '@tanstack/react-query';
import { sparePartsApi } from '../services';
import type { SparePart, SparePartListParams } from '../types';

export const sparePartKeys = {
  all: ['spare-parts'] as const,
  lists: () => [...sparePartKeys.all, 'list'] as const,
  list: (params: SparePartListParams) => [...sparePartKeys.lists(), params] as const,
};

/**
 * Spare parts for the work-order parts picker.
 *
 * `enabled` is the caller's decision rather than this hook's: the parts
 * dialog only mounts when the user opens it, and pre-fetching a parts
 * catalogue on every work-order page view would be a request nobody
 * asked for on a screen most visitors never act on.
 */
export function useSpareParts(params: SparePartListParams = {}, enabled = true) {
  return useQuery({
    queryKey: sparePartKeys.list(params),
    queryFn: () => sparePartsApi.list(params),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/**
 * Resolves a set of part ids to their names, for rendering a work
 * order's `partsUsed` list.
 *
 * WHY A LIST READ AND NOT N BY-ID READS: a work order carries a handful
 * of lines and the catalogue is small; one paged read is one request
 * instead of five, and it shares its cache entry with the picker that
 * is usually open on the same screen. If a part is missing from the
 * page (deleted, or beyond the limit) the caller falls back to the id
 * rather than inventing a name.
 */
export function usePartNames(partIds: string[], enabled = true) {
  const query = useSpareParts({ limit: 200 }, enabled && partIds.length > 0);

  const byId = new Map<string, SparePart>();
  for (const part of query.data?.data ?? []) byId.set(part._id, part);

  return {
    ...query,
    /** The part's name, or `null` when it could not be resolved. Never a guess. */
    nameFor: (id: string): string | null => byId.get(id)?.name ?? null,
    partFor: (id: string): SparePart | undefined => byId.get(id),
  };
}
