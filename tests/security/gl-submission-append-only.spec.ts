// tests/security/gl-submission-append-only.spec.ts
//
// GLSubmissionRepository holds figures the CUSTOMER supplied from their
// own general ledger, which makes it evidence rather than working data.
// Three properties matter:
//
//   1. Append-only. A submitted figure is never edited; a restatement is
//      a new submission.
//   2. Latest wins. findLatestPerAccountInScope must return the most
//      recent submission per account -- a reconciliation report silently
//      comparing against a superseded GL figure is the class of bug that
//      surfaces during an audit rather than in testing.
//   3. Scoped on every read, tenant AND org unit.
//
// Period matching is asserted explicitly because it is fully-contained
// (periodStart >= from AND periodEnd <= to) deliberately, to match
// AllocationLedgerRepository's totals paths so both sides of a
// reconciliation agree on which records belong to the period.

import { GLSubmissionRepository } from '../../modules/finance/repositories/gl-submission.repository';
import { FakeCollection } from '../helpers/fake-collection';
import type { GLSubmission } from '../../modules/finance/types/gl-reconciliation.types';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const OTHER_TENANT = 'toyota-zimbabwe-949d94';
const HARARE = 'unit-harare';
const BULAWAYO = 'unit-bulawayo';

const collection = new FakeCollection();

class TestGLSubmissionRepository extends GLSubmissionRepository {
  protected async getCollection(): Promise<any> {
    return collection as unknown as any;
  }
}

const repo = new TestGLSubmissionRepository();

function contextFor(organizationId: string, accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId,
    organizationName: 'Test Org',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

type AppendInput = Omit<
  GLSubmission,
  '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'createdBy' | 'updatedBy'
>;

const FROM = new Date('2026-07-01T00:00:00.000Z');
const TO = new Date('2026-07-31T23:59:59.000Z');

function makeSubmission(overrides: Partial<AppendInput> = {}): AppendInput {
  return {
    orgUnitId: HARARE,
    periodStart: FROM,
    periodEnd: TO,
    glAccountCode: '5100',
    glAmount: 1000,
    currency: 'USD',
    submittedBy: 'user-1',
    submittedAt: new Date('2026-08-01T09:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  collection.docs = [];
  collection.seenFilters = [];
});

describe('GLSubmissionRepository -- append-only', () => {
  it('append() persists the submission with tenant and audit fields', async () => {
    const submission = await repo.append(makeSubmission(), TENANT, 'user-1');

    expect(submission._id).toBeDefined();
    expect(submission.tenantId).toBe(TENANT);
    expect(submission.glAmount).toBe(1000);
    expect(collection.docs).toHaveLength(1);
  });

  it('update/softDelete/hardDelete all throw ConflictError and never mutate', async () => {
    const { ConflictError } = await import('../../server/errors/app.errors');
    await repo.append(makeSubmission(), TENANT, 'user-1');
    const before = JSON.stringify(collection.docs);

    await expect(repo.update()).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.softDelete()).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.hardDelete()).rejects.toBeInstanceOf(ConflictError);
    expect(JSON.stringify(collection.docs)).toBe(before);
  });

  it('the update error tells the caller what to do instead', async () => {
    await expect(repo.update()).rejects.toThrow(/Submit a new figure for the same period and account/);
  });
});

describe('latest submission wins', () => {
  it('returns the most recent submission per account code', async () => {
    await repo.append(
      makeSubmission({ glAmount: 1000, submittedAt: new Date('2026-08-01T09:00:00.000Z') }),
      TENANT,
      'user-1'
    );
    await repo.append(
      makeSubmission({
        glAmount: 1250,
        submittedAt: new Date('2026-08-05T09:00:00.000Z'),
        notes: 'Restated after month-end adjustment',
      }),
      TENANT,
      'user-2'
    );

    const latest = await repo.findLatestPerAccountInScope(FROM, TO, contextFor(TENANT, null));

    expect(latest.size).toBe(1);
    expect(latest.get('5100')!.glAmount).toBe(1250);
    // Both rows still exist -- the earlier figure is history, not garbage.
    expect(collection.docs).toHaveLength(2);
  });

  it('keeps accounts separate', async () => {
    await repo.append(makeSubmission({ glAccountCode: '5100', glAmount: 1000 }), TENANT, 'u1');
    await repo.append(makeSubmission({ glAccountCode: '5200', glAmount: 250 }), TENANT, 'u1');

    const latest = await repo.findLatestPerAccountInScope(FROM, TO, contextFor(TENANT, null));

    expect(latest.size).toBe(2);
    expect(latest.get('5100')!.glAmount).toBe(1000);
    expect(latest.get('5200')!.glAmount).toBe(250);
  });

  it('resolves latest by submittedAt even if insertion order disagrees', async () => {
    // Guards the explicit timestamp comparison in the repository: the
    // sort option alone is easy to drop in a later edit.
    await repo.append(
      makeSubmission({ glAmount: 999, submittedAt: new Date('2026-08-09T09:00:00.000Z') }),
      TENANT,
      'u1'
    );
    await repo.append(
      makeSubmission({ glAmount: 111, submittedAt: new Date('2026-08-02T09:00:00.000Z') }),
      TENANT,
      'u2'
    );

    const latest = await repo.findLatestPerAccountInScope(FROM, TO, contextFor(TENANT, null));
    expect(latest.get('5100')!.glAmount).toBe(999);
  });
});

describe('period matching is fully-contained', () => {
  it('includes a submission whose period sits inside the window', async () => {
    await repo.append(
      makeSubmission({
        periodStart: new Date('2026-07-10T00:00:00.000Z'),
        periodEnd: new Date('2026-07-20T00:00:00.000Z'),
      }),
      TENANT,
      'u1'
    );

    const rows = await repo.findInPeriodInScope(FROM, TO, contextFor(TENANT, null));
    expect(rows).toHaveLength(1);
  });

  it('excludes a submission whose period extends beyond the window', async () => {
    await repo.append(
      makeSubmission({
        periodStart: new Date('2026-06-01T00:00:00.000Z'),
        periodEnd: new Date('2026-08-31T00:00:00.000Z'),
      }),
      TENANT,
      'u1'
    );

    const rows = await repo.findInPeriodInScope(FROM, TO, contextFor(TENANT, null));
    expect(rows).toHaveLength(0);
  });
});

describe('scoping -- tenant AND org unit', () => {
  it('excludes another tenant\'s submissions', async () => {
    await repo.append(makeSubmission({ glAmount: 1000 }), TENANT, 'u1');
    await repo.append(makeSubmission({ glAmount: 5000 }), OTHER_TENANT, 'ux');

    const rows = await repo.findInPeriodInScope(FROM, TO, contextFor(TENANT, null));
    expect(rows).toHaveLength(1);
    expect(rows[0].glAmount).toBe(1000);
  });

  it('excludes org units outside the caller\'s scope', async () => {
    await repo.append(makeSubmission({ orgUnitId: HARARE, glAmount: 1000 }), TENANT, 'u1');
    await repo.append(makeSubmission({ orgUnitId: BULAWAYO, glAmount: 400 }), TENANT, 'u2');

    const rows = await repo.findInPeriodInScope(FROM, TO, contextFor(TENANT, [HARARE]));
    expect(rows).toHaveLength(1);
    expect(rows[0].orgUnitId).toBe(HARARE);
  });

  it('fails closed on an empty accessible-unit set', async () => {
    await repo.append(makeSubmission({ orgUnitId: HARARE }), TENANT, 'u1');

    const rows = await repo.findInPeriodInScope(FROM, TO, contextFor(TENANT, []));
    expect(rows).toEqual([]);

    const latest = await repo.findLatestPerAccountInScope(FROM, TO, contextFor(TENANT, []));
    expect(latest.size).toBe(0);
  });

  it('a scoped caller cannot see another branch\'s restatement via findLatestPerAccountInScope', async () => {
    await repo.append(
      makeSubmission({ orgUnitId: HARARE, glAmount: 1000, submittedAt: new Date('2026-08-01T00:00:00.000Z') }),
      TENANT,
      'u1'
    );
    await repo.append(
      makeSubmission({ orgUnitId: BULAWAYO, glAmount: 8888, submittedAt: new Date('2026-08-07T00:00:00.000Z') }),
      TENANT,
      'u2'
    );

    const latest = await repo.findLatestPerAccountInScope(FROM, TO, contextFor(TENANT, [HARARE]));
    // Without scoping the Bulawayo figure (later submittedAt) would win.
    expect(latest.get('5100')!.glAmount).toBe(1000);
  });
});
