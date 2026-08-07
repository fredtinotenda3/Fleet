// tests/security/document-id-normalization.spec.ts
//
// Guards the boundary where the declared type used to lie about the
// runtime shape.
//
// `BaseEntity._id` is typed `string`; the Mongo driver returns an
// `ObjectId`. Read methods bridged that with `as unknown as T[]`, a cast
// that converts nothing. Every consumer then treated `_id` as a string
// and it behaved like one until compared or used in a query.
//
// This suite lives under tests/security because both known consequences
// were tenant-isolation failures, not cosmetic ones.

import { ObjectId } from 'mongodb';
import { TenantScopedRepository } from '../../server/repositories/tenant-scoped.repository';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import { FakeCollection } from '../helpers/fake-collection';

const ORG = 'willsgrove-farm-enterprises-9e80ed';
const BRANCH = '6a7450cdc180a23f95f2f875';
const FLEET = '6a74694e60900c100f2a4ecb';

const collection = new FakeCollection();

class Repo extends TenantScopedRepository<any> {
  protected collectionName = 'tblorgunits';
  protected async getCollection(): Promise<any> {
    return collection as unknown as any;
  }
  /** Exposes the protected helpers for assertion. */
  public normalizePublic<R>(doc: unknown): R {
    return this.normalizeDoc<R>(doc);
  }
  public toObjectIdPublic(id: string | ObjectId): ObjectId {
    return this.toObjectId(id);
  }
}

const repo = new Repo();

describe('normalizeDoc', () => {
  it('converts an ObjectId _id to its hex string', () => {
    const out = repo.normalizePublic<{ _id: string }>({ _id: new ObjectId(FLEET), name: 'Heavy' });
    expect(out._id).toBe(FLEET);
    expect(typeof out._id).toBe('string');
  });

  it('leaves an already-string _id untouched', () => {
    const out = repo.normalizePublic<{ _id: string }>({ _id: FLEET });
    expect(out._id).toBe(FLEET);
  });

  it('preserves every other field, including nested ObjectIds', () => {
    // Deliberately shallow: reference fields are stored as strings in
    // this database, and a deep walk would rewrite ObjectIds inside
    // caller payloads that may legitimately hold them.
    const nested = new ObjectId(BRANCH);
    const out = repo.normalizePublic<any>({
      _id: new ObjectId(FLEET),
      name: 'Heavy',
      meta: { ref: nested },
    });
    expect(out.name).toBe('Heavy');
    expect(out.meta.ref).toBe(nested);
  });

  it('passes through null and non-objects', () => {
    expect(repo.normalizePublic(null)).toBeNull();
    expect(repo.normalizePublic(undefined)).toBeUndefined();
  });
});

describe('toObjectId round-trips a normalized id back into a filter', () => {
  it('rebuilds an equal ObjectId from the hex string', () => {
    const original = new ObjectId(FLEET);
    const rebuilt = repo.toObjectIdPublic(repo.normalizePublic<any>({ _id: original })._id);
    expect(rebuilt.equals(original)).toBe(true);
  });

  it('is a no-op for a value that is already an ObjectId', () => {
    const oid = new ObjectId(FLEET);
    expect(repo.toObjectIdPublic(oid)).toBe(oid);
  });
});

describe('the isolation bug this prevents', () => {
  // Regression for the real failure: expandWithDescendants() collected
  // `unit._id` (ObjectId) alongside assignment roots (strings). Mongo
  // does not coerce between the two inside `$in`, so a branch manager's
  // accessible set silently matched only the root and they saw nothing.
  it('a mixed ObjectId/string id set cannot match string-stored ids', () => {
    const stored = FLEET;
    const mixed: unknown[] = [BRANCH, new ObjectId(FLEET)];
    expect(mixed.includes(stored)).toBe(false);
  });

  it('a normalized id set does match', () => {
    const normalized = [BRANCH, new ObjectId(FLEET)].map((v) =>
      v instanceof ObjectId ? v.toHexString() : v
    );
    expect(normalized.includes(FLEET)).toBe(true);
  });

  it('reads through the repository yield string ids usable in a scope filter', async () => {
    collection.seenFilters = [];
    collection.seed([
      { _id: new ObjectId(FLEET), tenantId: ORG, orgUnitId: FLEET, isDeleted: false },
    ]);

    const context: TenantContext = {
      organizationId: ORG,
      organizationName: 'Willsgrove',
      accessibleOrgUnitIds: [FLEET],
      assignedOrgUnitIds: [FLEET],
      isPlatformScope: false,
    };

    const rows = await repo.findManyInScope({}, context);
    expect(rows).toHaveLength(1);
    expect(typeof rows[0]._id).toBe('string');
    expect(rows[0]._id).toBe(FLEET);
  });
});
