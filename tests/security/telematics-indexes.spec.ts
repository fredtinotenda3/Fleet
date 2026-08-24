// tests/security/telematics-indexes.spec.ts
//
// PHASE 1, F-3 regression suite, following the structure established by
// tests/security/finance-indexes.spec.ts.
//
// This does not (and without a live Mongo cannot) prove an EXPLAIN plan
// uses these indexes. What it proves statically is the set of things
// that actually went wrong here:
//
//   1. six telematics collections had NO index definitions at all;
//   2. tbltelematics had no index covering the tuple its upsert filters
//      on -- so the upsert was only idempotent in the happy path;
//   3. tbltelematics_eagletrack_links had no uniqueness on {tenantId,
//      uin}, so a tracker could silently be attributed to a different
//      vehicle between two syncs;
//   4. tblgeocode_cache had no expiry of any kind;
//   5. an addendum can be written and then forgotten in the spread,
//      which silently no-ops;
//   6. ensureIndexes() did not pass expireAfterSeconds through, so a TTL
//      index would have been created as an ordinary one -- present,
//      correct-looking, and expiring nothing.

import * as fs from 'fs';
import * as path from 'path';

import { INDEXES } from '../../infrastructure/database/indexes';
import { TELEMATICS_INDEXES } from '../../infrastructure/database/indexes.telematics-addendum';

const ROOT = path.resolve(__dirname, '../..');

const PREVIOUSLY_UNINDEXED = [
  'tbltelematics_eagletrack_links',
  'tbltelematics_eagletrack_triggers',
  'tbltelematics_eagletrack_config',
  'tbltelematics_cartrack_config',
  'tbltelematics_demo_state',
  'tblgeocode_cache',
] as const;

type IndexDef = {
  key: Record<string, number>;
  name: string;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
  expireAfterSeconds?: number;
};

const defsFor = (collection: string): IndexDef[] =>
  ((TELEMATICS_INDEXES as unknown as Record<string, IndexDef[]>)[collection] ?? []);

const byName = (collection: string, name: string): IndexDef | undefined =>
  defsFor(collection).find((d) => d.name === name);

describe('F-3: previously unindexed telematics collections', () => {
  it.each(PREVIOUSLY_UNINDEXED)('%s has at least one index', (collection) => {
    expect(defsFor(collection).length).toBeGreaterThan(0);
  });

  it.each(PREVIOUSLY_UNINDEXED)(
    '%s is actually merged into the exported INDEXES map',
    (collection) => {
      // The plausible bug: define an addendum, forget to spread it in.
      expect((INDEXES as Record<string, unknown>)[collection]).toEqual(
        defsFor(collection)
      );
    }
  );
});

describe('F-3: the telemetry idempotency key is unique', () => {
  const IDX = 'uniq_telematics_tenant_vehicle_device_ts';

  it('exists on tbltelematics', () => {
    expect(byName('tbltelematics', IDX)).toBeDefined();
  });

  it('covers exactly the tuple bulkUpsertHistoricalReadings filters on', () => {
    // Field order matters: this index exists to back the constraint, and
    // a differently-ordered key would not be used for the upsert filter.
    expect(Object.keys(byName('tbltelematics', IDX)!.key)).toEqual([
      'tenantId',
      'vehicleId',
      'deviceId',
      'timestamp',
    ]);
  });

  it('is unique', () => {
    // Without this, a Mongo upsert is not atomic and two concurrent
    // backfills over the same window both insert.
    expect(byName('tbltelematics', IDX)!.unique).toBe(true);
  });

  it('is NOT partial', () => {
    // Telemetry is append-only and never soft-deleted. Scoping this to
    // `isDeleted: false` would leave every row that actually exists
    // unconstrained -- a constraint that looks present and constrains
    // nothing.
    expect(byName('tbltelematics', IDX)!.partialFilterExpression).toBeUndefined();
  });

  it('matches the filter the repository actually uses', () => {
    // Guards against the index and the query drifting apart: if someone
    // changes the upsert key, this fails rather than silently leaving an
    // unenforced constraint behind.
    const repo = fs.readFileSync(
      path.join(ROOT, 'modules/telematics/repositories/telematics.repository.ts'),
      'utf8'
    );
    for (const field of ['tenantId', 'vehicleId', 'deviceId', 'timestamp']) {
      expect(repo).toContain(field);
    }
    expect(repo).toContain('$setOnInsert');
  });
});

describe('F-3: the Eagle Track tracker link is unique per tenant+uin', () => {
  const IDX = 'uniq_eagletrack_link_tenant_uin';

  it('exists and is unique on {tenantId, uin}', () => {
    const def = byName('tbltelematics_eagletrack_links', IDX);
    expect(def).toBeDefined();
    expect(Object.keys(def!.key)).toEqual(['tenantId', 'uin']);
    expect(def!.unique).toBe(true);
  });

  it('is partial on isDeleted:false so a tracker can be re-linked', () => {
    // This codebase soft-deletes. A plain unique index would make a uin
    // unusable forever once its link was deleted.
    expect(byName('tbltelematics_eagletrack_links', IDX)!.partialFilterExpression).toEqual(
      { isDeleted: false }
    );
  });
});

describe('F-3: the geocode cache expires', () => {
  const IDX = 'ttl_geocode_cache_resolved_at';

  it('declares a TTL index', () => {
    const def = byName('tblgeocode_cache', IDX);
    expect(def).toBeDefined();
    expect(typeof def!.expireAfterSeconds).toBe('number');
    expect(def!.expireAfterSeconds).toBeGreaterThan(0);
  });

  it('keys the TTL on a field that exists on GeocodeCacheEntry', () => {
    // There is no createdAt on this entity; the timestamp field is
    // `resolvedAt`. A TTL on a non-existent field expires nothing and
    // reports no error.
    const key = Object.keys(byName('tblgeocode_cache', IDX)!.key);
    expect(key).toEqual(['resolvedAt']);

    const entity = fs.readFileSync(
      path.join(ROOT, 'modules/telematics/repositories/geocode-cache.repository.ts'),
      'utf8'
    );
    expect(entity).toContain('resolvedAt');
  });

  it('ensureIndexes passes expireAfterSeconds through', () => {
    // Before Phase 1 it did not, so a declared TTL would have been
    // created as an ordinary index: present, correct-looking, and
    // expiring nothing.
    const src = fs.readFileSync(
      path.join(ROOT, 'infrastructure/database/indexes.ts'),
      'utf8'
    );
    expect(src).toContain('expireAfterSeconds');
    expect(src).toMatch(/options\.expireAfterSeconds\s*=/);
  });
});

describe('F-3: structural soundness of the telematics index set', () => {
  it('no index NAME is reused for a different key', () => {
    // The dangerous case is one name bound to two different key specs:
    // Mongo rejects the second with IndexKeySpecsConflict (86), which
    // ensureIndexes deliberately swallows, so one of the two indexes
    // would silently never exist.
    //
    // Asserting on name uniqueness alone would fail on a harmless
    // pre-existing redundancy: tblfuellogs and tbltrips each list
    // idx_fuel_tenant_plate_date / idx_trip_tenant_plate_date twice with
    // BYTE-IDENTICAL keys, where the repeated createIndex is a no-op.
    // That is worth recording (see PHASE_1_REMAINING_FINDINGS.md) but it
    // is not a correctness defect, and a test that conflated the two
    // would push someone to "fix" it by weakening this assertion.
    const byName = new Map<string, string>();
    const conflicts: string[] = [];

    for (const defs of Object.values(INDEXES as Record<string, IndexDef[]>)) {
      for (const def of defs) {
        const spec = JSON.stringify(def.key);
        const seen = byName.get(def.name);
        if (seen === undefined) byName.set(def.name, spec);
        else if (seen !== spec) conflicts.push(`${def.name}: ${seen} vs ${spec}`);
      }
    }

    expect(conflicts).toEqual([]);
  });

  it('every telematics index leads with tenantId, except documented exceptions', () => {
    // Tenant-isolation baseline: a telematics index should not be
    // satisfiable by a cross-tenant scan.
    //
    // Three deliberate exceptions, each named rather than silently
    // skipped, because an unexplained exemption is how a real leak gets
    // waved through later:
    //
    //   ttl_*            A TTL index MUST be single-field on the date,
    //                    so it cannot be tenant-prefixed. It is an
    //                    expiry mechanism, never a query path.
    //   idx_*_enabled    listEnabledTenantIds() is a PLATFORM job (the
    //                    sync cron) whose entire purpose is enumerating
    //                    which tenants to poll. It is cross-tenant by
    //                    design and projects {tenantId: 1} only.
    //   geofence_states  Pre-existing: keyed {vehicleId, geofenceId},
    //                    both globally-unique ObjectIds. Safe by
    //                    accident rather than design -- recorded in
    //                    PHASE_1_REMAINING_FINDINGS.md.
    const EXEMPT = new Set([
      'ttl_geocode_cache_resolved_at',
      'idx_eagletrack_config_enabled',
      'idx_cartrack_config_enabled',
      'idx_geofence_state_vehicle_geofence',
    ]);

    const offenders: string[] = [];
    for (const [collection, defs] of Object.entries(
      TELEMATICS_INDEXES as unknown as Record<string, IndexDef[]>
    )) {
      for (const def of defs) {
        if (EXEMPT.has(def.name)) continue;
        if (Object.keys(def.key)[0] !== 'tenantId') {
          offenders.push(`${collection}.${def.name}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('no index declares both unique and a TTL', () => {
    // Mongo permits it, but the combination almost always means the
    // author intended two separate indexes.
    for (const defs of Object.values(
      TELEMATICS_INDEXES as unknown as Record<string, IndexDef[]>
    )) {
      for (const def of defs) {
        expect(def.unique && typeof def.expireAfterSeconds === 'number').toBeFalsy();
      }
    }
  });

  it('a cleanup script exists for the collection that needs one before its unique index', () => {
    // Mongo refuses to create a unique index on a collection that
    // already violates it, so tbltelematics needs a sweep on any
    // database that ran the pre-Phase-1 code.
    const script = path.join(ROOT, 'scripts/dedupe-telemetry-readings.ts');
    expect(fs.existsSync(script)).toBe(true);

    const src = fs.readFileSync(script, 'utf8');
    // Dry-run by default: --apply must be opt-in.
    expect(src).toContain("includes('--apply')");
  });
});
