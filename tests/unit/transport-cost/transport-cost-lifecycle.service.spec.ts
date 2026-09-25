// tests/unit/transport-cost/transport-cost-lifecycle.service.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. Pure-function coverage for
// deriveOperationalStatus() and the field-classification helpers -- see
// OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md Section 8.1 for the state
// table this pins. No I/O, no mocks: these are plain functions over
// plain data.

import {
  deriveOperationalStatus,
  patchTouchesFinancialField,
  patchOnlyTouchesNonFinancialFields,
  FINANCIAL_SOURCE_RECORD_FIELDS,
} from '../../../modules/transport-cost/services/transport-cost-lifecycle.service';
import type { AllocationPosting } from '../../../modules/finance/types/allocation.types';

function posting(overrides: Partial<AllocationPosting> = {}): AllocationPosting {
  return {
    _id: 'posting-1',
    tenantId: 't1',
    orgUnitId: 'ou1',
    vehicleId: 'v1',
    costCategory: 'third-party-transport',
    allocationRule: 'direct',
    sourceCollection: 'tbltransportcostsourcerecords',
    sourceId: 'src-1',
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-01-01'),
    currency: 'USD',
    amount: 100,
    fxRate: 1,
    fxRateDate: new Date('2026-01-01'),
    fxSource: 'organization-default',
    reportingCurrency: 'USD',
    reportingAmount: 100,
    postedBy: 'user-1',
    postedAt: new Date('2026-01-01'),
    ...overrides,
  } as AllocationPosting;
}

describe('deriveOperationalStatus', () => {
  it('needs-review: no posting history, a pending review item references this record', () => {
    const result = deriveOperationalStatus({ cancelledAt: undefined }, true, []);
    expect(result.status).toBe('needs-review');
    expect(result.livePosting).toBeNull();
  });

  it('ready-to-post: no posting history, no pending review', () => {
    const result = deriveOperationalStatus({ cancelledAt: undefined }, false, []);
    expect(result.status).toBe('ready-to-post');
  });

  it('posted: the most recent original posting has not been reversed', () => {
    const original = posting({ _id: 'p1' });
    const result = deriveOperationalStatus({ cancelledAt: undefined }, false, [original]);
    expect(result.status).toBe('posted');
    expect(result.livePosting?._id).toBe('p1');
  });

  it('reversed: an original exists but every original has since been reversed, nothing reposted', () => {
    const original = posting({ _id: 'p1' });
    const reversal = posting({ _id: 'p2', reversalOfPostingId: 'p1', amount: -100, reportingAmount: -100 });
    const result = deriveOperationalStatus({ cancelledAt: undefined }, false, [original, reversal]);
    expect(result.status).toBe('reversed');
    expect(result.livePosting).toBeNull();
  });

  it('posted (corrected): reversed once, then reposted -- the newest original is live', () => {
    const original = posting({ _id: 'p1' });
    const reversal = posting({ _id: 'p2', reversalOfPostingId: 'p1', amount: -100, reportingAmount: -100 });
    const corrected = posting({ _id: 'p3', amount: 1200, reportingAmount: 1200 });
    const result = deriveOperationalStatus({ cancelledAt: undefined }, false, [original, reversal, corrected]);
    expect(result.status).toBe('posted');
    expect(result.livePosting?._id).toBe('p3');
  });

  it('cancelled: cancelledAt set, and there is no posting history at all', () => {
    const result = deriveOperationalStatus({ cancelledAt: new Date('2026-02-01') }, false, []);
    expect(result.status).toBe('cancelled');
  });

  it('reversed, NOT cancelled: cancelledAt set AND posting history exists (posted-then-cancelled) -- ' +
     'this is the state table\'s central REVERSED vs CANCELLED distinction', () => {
    const original = posting({ _id: 'p1' });
    const reversal = posting({ _id: 'p2', reversalOfPostingId: 'p1', amount: -100, reportingAmount: -100 });
    const result = deriveOperationalStatus({ cancelledAt: new Date('2026-02-01') }, false, [original, reversal]);
    expect(result.status).toBe('reversed');
  });

  it('a pending review item is irrelevant once anything has posted -- posted history always wins', () => {
    const original = posting({ _id: 'p1' });
    const result = deriveOperationalStatus({ cancelledAt: undefined }, true, [original]);
    expect(result.status).toBe('posted');
  });
});

describe('patchTouchesFinancialField / patchOnlyTouchesNonFinancialFields', () => {
  it('every field in FINANCIAL_SOURCE_RECORD_FIELDS is detected as financial', () => {
    for (const field of FINANCIAL_SOURCE_RECORD_FIELDS) {
      expect(patchTouchesFinancialField({ [field]: 'x' })).toBe(true);
      expect(patchOnlyTouchesNonFinancialFields({ [field]: 'x' })).toBe(false);
    }
  });

  it('a pure non-financial patch is never flagged financial, and passes the non-financial-only check', () => {
    const patch = { customerName: 'Acme', destinationTown: 'Bulawayo' };
    expect(patchTouchesFinancialField(patch)).toBe(false);
    expect(patchOnlyTouchesNonFinancialFields(patch)).toBe(true);
  });

  it('a mixed patch (one financial + one non-financial field) is flagged financial', () => {
    const patch = { customerName: 'Acme', amount: 500 };
    expect(patchTouchesFinancialField(patch)).toBe(true);
    expect(patchOnlyTouchesNonFinancialFields(patch)).toBe(false);
  });

  it('an empty patch touches nothing financial', () => {
    expect(patchTouchesFinancialField({})).toBe(false);
    expect(patchOnlyTouchesNonFinancialFields({})).toBe(true);
  });
});
