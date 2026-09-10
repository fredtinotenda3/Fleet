// frontend/modules/search/utils/search-results.ts
//
// Turns the search API's response into the shape the command palette
// already renders.
//
// A pure function, because jest here runs `testEnvironment: 'node'` with
// no jsdom -- a decision made inside the palette component could not be
// tested at all. Everything that could be WRONG rather than merely ugly
// lives here: which group a record lands in, how a result with no
// subtitle reads, and what the palette says when a source was skipped
// because the user cannot read it.

export type SearchResultKind =
  | 'vehicle'
  | 'driver'
  | 'trip'
  | 'work-order'
  | 'maintenance'
  | 'expense';

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export interface GlobalSearchResponse {
  query: string;
  results: SearchResult[];
  skipped: SearchResultKind[];
  failed: SearchResultKind[];
  truncated: boolean;
}

/** Group heading per record type, matching the sidebar's language. */
export const KIND_GROUP: Record<SearchResultKind, string> = {
  vehicle: 'Vehicles',
  driver: 'Drivers',
  trip: 'Trips',
  'work-order': 'Work orders',
  maintenance: 'Maintenance',
  expense: 'Expenses',
};

/**
 * Ordered so the most identifying record types come first.
 *
 * Someone typing a plate is almost always looking for the vehicle, and
 * the same plate matches its trips, its work orders and its expenses.
 * Ranking by relevance score would need a score; ranking by KIND is
 * honest about the fact that there isn't one.
 */
export const KIND_ORDER: SearchResultKind[] = [
  'vehicle',
  'driver',
  'work-order',
  'maintenance',
  'trip',
  'expense',
];

export interface SearchGroup {
  group: string;
  kind: SearchResultKind;
  items: SearchResult[];
}

/** Results grouped by kind, in KIND_ORDER, dropping empty groups. */
export function groupSearchResults(results: readonly SearchResult[]): SearchGroup[] {
  const byKind = new Map<SearchResultKind, SearchResult[]>();
  for (const result of results) {
    const bucket = byKind.get(result.kind) ?? [];
    bucket.push(result);
    byKind.set(result.kind, bucket);
  }

  return KIND_ORDER.filter((kind) => (byKind.get(kind)?.length ?? 0) > 0).map((kind) => ({
    group: KIND_GROUP[kind],
    kind,
    items: byKind.get(kind)!,
  }));
}

/**
 * What to tell the user underneath the results.
 *
 * Returns null when there is nothing worth saying -- a footnote that
 * appears on every search is noise, and noise is how the one that
 * matters gets ignored.
 *
 * The three cases are deliberately different sentences:
 *
 *   FAILED   something broke, and the absence of a record proves nothing.
 *   SKIPPED  the user cannot read that kind of record. Saying so lets
 *            them tell "there is no such work order" from "you cannot
 *            see work orders" -- which is the difference between a data
 *            question and an access question.
 *   TRUNCATED there are more matches than are shown.
 */
export function searchFootnote(response: Pick<
  GlobalSearchResponse,
  'skipped' | 'failed' | 'truncated'
>): string | null {
  const parts: string[] = [];

  if (response.failed.length > 0) {
    parts.push(
      `Couldn't search ${listKinds(response.failed)} — results may be incomplete.`
    );
  }
  if (response.truncated) {
    parts.push('More matches exist than are shown; open the module to see them all.');
  }
  if (response.skipped.length > 0) {
    parts.push(`${listKinds(response.skipped)} aren't searched because you can't view them.`);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

function listKinds(kinds: readonly SearchResultKind[]): string {
  const labels = kinds.map((k) => KIND_GROUP[k].toLowerCase());
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * The minimum query length the API will act on.
 *
 * Mirrored here so the palette does not fire a request the server will
 * refuse, and so the "keep typing" state is a client-side fact rather
 * than a round trip.
 */
export const MIN_SEARCH_LENGTH = 2;

export function isSearchable(query: string): boolean {
  return query.trim().length >= MIN_SEARCH_LENGTH;
}
