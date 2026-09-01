// tests/security/query-cache-scope.spec.ts
//
// BACKLOG ITEM 4 (audit finding F-9).
//
// The property under test is the one the finding names: a value
// computed for one caller's org-unit scope must never be served to a
// caller with a different scope. Everything else here exists to make
// that property hold in practice -- the disabled default, the
// invalidation prefix, the date-range dimension.
//
// Uses the real `cacheService` in-memory path (no REDIS_URL in tests),
// so the assertions run through the actual key building and the actual
// pattern matching rather than a double that could agree with a wrong
// implementation.

import {
  QueryCacheService,
  cacheScopeFor,
  orgWideCacheScope,
  cacheScopeFingerprint,
  buildScopedCacheKey,
  queryCacheEnabled,
} from '@/infrastructure/cache/query-cache.service';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const OTHER_TENANT = 'toyota-zimbabwe-63078f';

function context(accessibleOrgUnitIds: string[] | null, tenantId = TENANT): TenantContext {
  return {
    organizationId: tenantId,
    organizationName: 'Willsgrove',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

let cache: QueryCacheService;

beforeEach(() => {
  process.env.QUERY_CACHE_ENABLED = 'true';
  cache = new QueryCacheService();
});

afterEach(async () => {
  // Clear the process-wide in-memory store between tests.
  await new QueryCacheService().invalidatePattern('*');
  delete process.env.QUERY_CACHE_ENABLED;
});

// ─────────────────────────────────────────────────────────────────────
describe('the default is off', () => {
  it('read-through population is disabled unless QUERY_CACHE_ENABLED=true', () => {
    delete process.env.QUERY_CACHE_ENABLED;
    expect(queryCacheEnabled()).toBe(false);

    process.env.QUERY_CACHE_ENABLED = 'false';
    expect(queryCacheEnabled()).toBe(false);

    // Anything other than the exact string is off: a half-set env var
    // must not quietly turn on caching for financial figures.
    process.env.QUERY_CACHE_ENABLED = '1';
    expect(queryCacheEnabled()).toBe(false);

    process.env.QUERY_CACHE_ENABLED = 'true';
    expect(queryCacheEnabled()).toBe(true);
  });

  it('disabled, it is indistinguishable from no cache -- every call hits the fetcher', async () => {
    delete process.env.QUERY_CACHE_ENABLED;
    const fetcher = jest.fn(async () => ({ total: 1 }));

    await cache.getOrFetch(orgWideCacheScope(TENANT), 'dashboard', 'kpis', fetcher);
    await cache.getOrFetch(orgWideCacheScope(TENANT), 'dashboard', 'kpis', fetcher);
    await cache.getOrFetch(orgWideCacheScope(TENANT), 'dashboard', 'kpis', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('no cross-org-unit reuse', () => {
  it('a Harare-scoped value is not served to a Bulawayo-scoped caller', async () => {
    const harareFetcher = jest.fn(async () => ({ vehicles: 30, branch: 'harare' }));
    const bulawayoFetcher = jest.fn(async () => ({ vehicles: 20, branch: 'bulawayo' }));

    const harare = await cache.getDashboardKPIs(
      cacheScopeFor(context(['unit-harare'])),
      harareFetcher
    );
    const bulawayo = await cache.getDashboardKPIs(
      cacheScopeFor(context(['unit-bulawayo'])),
      bulawayoFetcher
    );

    expect(harare).toEqual({ vehicles: 30, branch: 'harare' });
    // The assertion the finding is about: Bulawayo must not receive
    // Harare's figures from the cache.
    expect(bulawayo).toEqual({ vehicles: 20, branch: 'bulawayo' });
    expect(bulawayoFetcher).toHaveBeenCalledTimes(1);
  });

  it('an ORG-WIDE value (what the warm job computes) is not served to a scoped caller', async () => {
    // This is defect (2): the only populate path is the analytics
    // worker, which computes org-wide figures with no TenantContext.
    const warm = jest.fn(async () => ({ vehicles: 76, scope: 'org-wide' }));
    await cache.getDashboardKPIs(orgWideCacheScope(TENANT), warm);

    const scopedFetcher = jest.fn(async () => ({ vehicles: 30, scope: 'harare' }));
    const scoped = await cache.getDashboardKPIs(
      cacheScopeFor(context(['unit-harare'])),
      scopedFetcher
    );

    expect(scoped).toEqual({ vehicles: 30, scope: 'harare' });
    expect(scopedFetcher).toHaveBeenCalledTimes(1);
  });

  it('a scoped value is not served to an org-wide caller either', async () => {
    const scopedFetcher = jest.fn(async () => ({ vehicles: 30 }));
    await cache.getDashboardKPIs(cacheScopeFor(context(['unit-harare'])), scopedFetcher);

    const orgWideFetcher = jest.fn(async () => ({ vehicles: 76 }));
    const orgWide = await cache.getDashboardKPIs(
      cacheScopeFor(context(null)),
      orgWideFetcher
    );

    expect(orgWide).toEqual({ vehicles: 76 });
  });

  it('a NARROWER scope does not reuse a WIDER one -- a subset is not a match', async () => {
    const wide = jest.fn(async () => ({ vehicles: 50 }));
    await cache.getDashboardKPIs(cacheScopeFor(context(['unit-harare', 'unit-logistics'])), wide);

    const narrow = jest.fn(async () => ({ vehicles: 30 }));
    const result = await cache.getDashboardKPIs(cacheScopeFor(context(['unit-harare'])), narrow);

    expect(result).toEqual({ vehicles: 30 });
    expect(narrow).toHaveBeenCalledTimes(1);
  });

  it('a user assigned to NO unit gets their own key, never anyone else s', async () => {
    // The fail-closed control account (`unassigned@`) must see zero
    // rows -- and must not be able to warm, or be served from, a key
    // shared with an org-wide computation.
    const unassignedKey = buildScopedCacheKey('dashboard', cacheScopeFor(context([])), 'kpis');
    const orgWideKey = buildScopedCacheKey('dashboard', orgWideCacheScope(TENANT), 'kpis');
    const harareKey = buildScopedCacheKey('dashboard', cacheScopeFor(context(['unit-harare'])), 'kpis');

    expect(unassignedKey).not.toBe(orgWideKey);
    expect(unassignedKey).not.toBe(harareKey);
  });

  it('the same scope in a different order shares a key -- ordering must not cause misses', () => {
    const a = cacheScopeFingerprint(cacheScopeFor(context(['unit-a', 'unit-b'])));
    const b = cacheScopeFingerprint(cacheScopeFor(context(['unit-b', 'unit-a'])));
    const c = cacheScopeFingerprint(cacheScopeFor(context(['unit-b', 'unit-a', 'unit-a'])));

    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('two tenants never share a key even with identical unit ids', () => {
    const mine = buildScopedCacheKey('dashboard', cacheScopeFor(context(['unit-1'], TENANT)), 'kpis');
    const theirs = buildScopedCacheKey(
      'dashboard',
      cacheScopeFor(context(['unit-1'], OTHER_TENANT)),
      'kpis'
    );

    expect(mine).not.toBe(theirs);
    expect(mine).toContain(TENANT);
    expect(theirs).toContain(OTHER_TENANT);
  });

  it('separates date-range variants of the same figure', async () => {
    const allTime = jest.fn(async () => ({ total: 100 }));
    const lastMonth = jest.fn(async () => ({ total: 12 }));

    const scope = cacheScopeFor(context(['unit-harare']));
    await cache.getDashboardKPIs(scope, allTime, 'all-time');
    const result = await cache.getDashboardKPIs(scope, lastMonth, '2026-08');

    // The warm job caches the no-range figure; a request asking for
    // last month must not be handed it.
    expect(result).toEqual({ total: 12 });
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('caching actually works when enabled', () => {
  it('serves a second identical request from the cache', async () => {
    const fetcher = jest.fn(async () => ({ vehicles: 30 }));
    const scope = cacheScopeFor(context(['unit-harare']));

    await cache.getDashboardKPIs(scope, fetcher);
    const second = await cache.getDashboardKPIs(scope, fetcher);

    expect(second).toEqual({ vehicles: 30 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('invalidation matches the keys that are actually stored', () => {
  it('clears a populated entry -- the prefix defect (3)', async () => {
    const fetcher = jest.fn(async () => ({ vehicles: 30 }));
    const scope = cacheScopeFor(context(['unit-harare']));

    await cache.getDashboardKPIs(scope, fetcher);
    await cache.getDashboardKPIs(scope, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await cache.invalidateDashboard(TENANT);

    await cache.getDashboardKPIs(scope, fetcher);
    // Before the prefix fix this was still 1: `deletePattern` scanned
    // for `dashboard:...` while the entry was stored at
    // `cache:dashboard:...`, so every invalidation was a no-op.
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('clears EVERY scope s copy, not just the caller s own', async () => {
    const harare = jest.fn(async () => ({ vehicles: 30 }));
    const bulawayo = jest.fn(async () => ({ vehicles: 20 }));
    const harareScope = cacheScopeFor(context(['unit-harare']));
    const bulawayoScope = cacheScopeFor(context(['unit-bulawayo']));

    await cache.getDashboardKPIs(harareScope, harare);
    await cache.getDashboardKPIs(bulawayoScope, bulawayo);

    await cache.invalidateDashboard(TENANT);

    await cache.getDashboardKPIs(harareScope, harare);
    await cache.getDashboardKPIs(bulawayoScope, bulawayo);

    // A vehicle write cannot know which accessible-unit combinations
    // cached a row it touched, so invalidation is scope-blind by
    // design. Over-invalidating costs a recomputation; under-
    // invalidating serves a figure known to be wrong.
    expect(harare).toHaveBeenCalledTimes(2);
    expect(bulawayo).toHaveBeenCalledTimes(2);
  });

  it('does not clear another tenant s entries', async () => {
    const mine = jest.fn(async () => ({ vehicles: 30 }));
    const theirs = jest.fn(async () => ({ vehicles: 5 }));

    await cache.getDashboardKPIs(cacheScopeFor(context(['u'], TENANT)), mine);
    await cache.getDashboardKPIs(cacheScopeFor(context(['u'], OTHER_TENANT)), theirs);

    await cache.invalidateDashboard(TENANT);

    await cache.getDashboardKPIs(cacheScopeFor(context(['u'], OTHER_TENANT)), theirs);
    expect(theirs).toHaveBeenCalledTimes(1);
  });

  it('invalidateVehicle clears the vehicle entry across scopes', async () => {
    const fetcher = jest.fn(async () => ({ km: 100 }));
    const scope = cacheScopeFor(context(['unit-harare']));

    await cache.getVehicleAnalytics(scope, 'vehicle-1', fetcher);
    await cache.invalidateVehicle(TENANT, 'vehicle-1');
    await cache.getVehicleAnalytics(scope, 'vehicle-1', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('accepts an already-prefixed pattern unchanged, so both call styles work', async () => {
    const fetcher = jest.fn(async () => ({ v: 1 }));
    const scope = cacheScopeFor(context(['unit-harare']));

    await cache.getFleetSummary(scope, fetcher);
    await cache.invalidatePattern(`cache:fleet:${TENANT}:*`);
    await cache.getFleetSummary(scope, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
