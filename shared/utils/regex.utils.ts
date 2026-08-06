// shared/utils/regex.utils.ts

/**
 * Escapes a user-supplied string so it can be embedded in a MongoDB
 * `$regex` without being interpreted as a pattern.
 *
 * FIX (OWASP A03 -- injection / ReDoS). Search and filter endpoints
 * interpolated raw user input straight into `$regex`, e.g.
 *
 *   { license_plate: { $regex: searchTerm, $options: 'i' } }
 *
 * That let a caller supply `.*` to match every row, or a catastrophic
 * backtracking pattern such as `(a+)+$` to pin a query thread. Because
 * these run as unindexed collection scans over a collection shared by
 * every tenant, it is also a cross-tenant availability risk: one
 * customer can degrade every other customer's queries.
 *
 * Escapes the full set of regex metacharacters per MDN / RegExp spec.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a safe case-insensitive "starts with" matcher for filter
 * fields (the prefix form the filter UI actually means).
 */
export function prefixMatch(input: string): { $regex: string; $options: string } {
  return { $regex: `^${escapeRegex(input)}`, $options: 'i' };
}

/**
 * Builds a safe case-insensitive "contains" matcher for free-text
 * search boxes.
 */
export function containsMatch(input: string): { $regex: string; $options: string } {
  return { $regex: escapeRegex(input), $options: 'i' };
}
