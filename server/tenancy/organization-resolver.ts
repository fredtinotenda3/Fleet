// server/tenancy/organization-resolver.ts
//
// SINGLE SOURCE OF TRUTH for "given a tenantId, load the organization".
//
// ---------------------------------------------------------------------
// The bug this file exists to fix (critical, production-blocking)
// ---------------------------------------------------------------------
// `tenantId` in this database is the organization SLUG, not the
// organization's `_id`. Confirmed directly from tblorganizations:
//
//   { _id: ObjectId(...),
//     slug:     "willsgrove-farm-enterprises-9e80ed",
//     tenantId: "willsgrove-farm-enterprises-9e80ed" }
//
// Every business row (tblvehicles, tblfuellogs, ...) carries that same
// slug in its `tenantId`, and every JWT carries it as the tenant claim.
//
// But eleven call sites did this:
//
//   organizationRepository.findById(tenantId, tenantId, false, true)
//
// BaseRepository.findById() opens with `if (!ObjectId.isValid(id))
// return null;`. A slug is not 24 hex characters, so that guard returns
// null before touching the database -- 100% of the time, for every
// organization, forever.
//
// The blast radius is not cosmetic. TenantContextService.resolveContext()
// turns that null into `throw new NotFoundError('Organization not
// found')`, and resolveContext() is the entry point for EVERY
// org-unit-scoped read path in the product. The practical effect:
//
//   * every endpoint that resolves a TenantContext 404s for every
//     non-platform user (a platform admin skips the lookup, which is
//     exactly why this stayed invisible to the super-admin account
//     doing the testing);
//   * the org-unit scoping work in Phases A-C -- the entire
//     multi-tenancy feature -- could never execute a single query;
//   * the dashboard renders "Failed to load this widget" for the
//     analytics widgets (expense breakdown) while the widgets that use
//     the older bare-tenantId path (fleet size, fuel spend) load fine.
//     That mixed-success symptom is diagnostic of exactly this: the two
//     groups differ only in whether they call resolveContext().
//
// ---------------------------------------------------------------------
// The resolution rule
// ---------------------------------------------------------------------
// A tenantId is accepted in either form, slug first (the canonical one),
// ObjectId second (defensive -- some seed/admin paths pass String(_id)).
// Resolution is deliberately explicit rather than "try findById and hope"
// so a future change of canonical key has exactly one place to edit.
//
// NOTE ON CACHING: organizations are read on nearly every request and
// change rarely, so this memoizes per-process with a short TTL. The TTL
// is short enough that a suspension/rename propagates within seconds,
// and `invalidateOrganizationCache()` is exported for write paths that
// need immediate consistency (OrganizationService.update / suspend).

import { Organization } from '@/shared/types/organization.types';
import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';
import { resolveTenantScope } from './tenant-scope';

/** How long a resolved organization stays memoized per process. */
const ORGANIZATION_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  value: Organization | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Drops a tenant's memoized organization (or the whole cache when called
 * with no argument). Call after any write that changes a field a caller
 * reads through this resolver -- name, slug, status, settings.
 */
export function invalidateOrganizationCache(tenantId?: string): void {
  if (tenantId === undefined) {
    cache.clear();
    return;
  }
  cache.delete(tenantId);
}

/**
 * Loads the organization a tenantId refers to, accepting either the
 * canonical slug or a stringified ObjectId.
 *
 * Returns null when no organization matches. Throws TenantScopeError
 * (via resolveTenantScope) for a legacy sentinel or an empty value --
 * those are misconfigurations, not misses, and must not be swallowed
 * into a quiet null.
 */
export async function resolveOrganization(
  tenantId: string
): Promise<Organization | null> {
  // Fail closed on 'default' / 'system' / '' before doing any I/O.
  const scope = resolveTenantScope(tenantId);
  if (scope.kind === 'platform') {
    // Platform scope is not an organization. Callers must branch on
    // scope.kind before reaching here; returning null rather than
    // throwing keeps this usable in "resolve if there is one" paths.
    return null;
  }

  const key = scope.tenantId;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let organization = await organizationRepository.findBySlug(key);

  if (!organization) {
    // Defensive second attempt: some administrative and seed paths pass
    // String(org._id) rather than the slug. findById's own
    // ObjectId.isValid() guard makes this a safe no-op for a slug.
    organization = await organizationRepository.findById(key, key, false, true);
  }

  cache.set(key, {
    value: organization,
    // A miss is cached for a much shorter window than a hit so a newly
    // created organization becomes visible promptly, while a hot loop
    // against a genuinely unknown tenant still can't hammer the database.
    expiresAt: Date.now() + (organization ? ORGANIZATION_CACHE_TTL_MS : 2_000),
  });

  return organization;
}

/**
 * Same as resolveOrganization() but returns just the display name,
 * falling back to the tenantId when the organization cannot be found.
 * For log lines and email subjects, where a missing organization should
 * degrade rather than throw.
 */
export async function resolveOrganizationName(tenantId: string): Promise<string> {
  try {
    const organization = await resolveOrganization(tenantId);
    return organization?.name ?? tenantId;
  } catch {
    return tenantId;
  }
}
