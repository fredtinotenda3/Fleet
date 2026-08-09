// tests/security/ledger-export-scope.spec.ts
//
// The value-ledger export is, like the ESG export it mirrors, a
// highest-consequence read path: its output leaves the request as a
// JSON body or a downloadable PDF and is kept. Two properties are
// asserted here, matching tests/security/esg-export-scope.spec.ts's
// structure:
//
//   1. Behavioural -- ledgerExportService.buildExport() threads the
//      caller's TenantContext straight into
//      valueLedgerRepository.getFilteredEntriesForExport(), and the
//      summary rollup it computes matches the rows the repository
//      returned (never recomputed from an unscoped read).
//   2. Structural -- ledger-export.controller.ts resolves a full
//      TenantContext via resolveTenantContext(req) before calling the
//      service, the same helper every other export controller uses
//      (see export-scope-conformance.spec.ts's header for why a
//      tenantId-only signature is the leak shape this guards against).
//
// Also covers: the row cap / truncation flag surfaces unchanged from
// the repository into the exported data, and date/source filters are
// passed through untouched.

import * as fs from 'fs';
import * as path from 'path';
import { ledgerExportService } from '../../modules/attention/services/ledger-export.service';
import { valueLedgerRepository } from '../../modules/attention/repositories/value-ledger.repository';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import type { ValueLedgerEntry } from '../../modules/attention/types/value-ledger.types';

jest.mock('../../modules/attention/repositories/value-ledger.repository', () => ({
  valueLedgerRepository: { getFilteredEntriesForExport: jest.fn() },
}));

const mockedGetFilteredEntries = valueLedgerRepository.getFilteredEntriesForExport as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE_BRANCH = 'branch-harare';

function makeScopedContext(accessibleOrgUnitIds: string[] | null, activeOrgUnitId?: string): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    activeOrgUnitId,
    isPlatformScope: false,
  } as TenantContext;
}

function makeEntry(overrides: Partial<ValueLedgerEntry> = {}): ValueLedgerEntry {
  return {
    _id: 'ledger-1',
    tenantId: TENANT,
    orgUnitId: HARARE_BRANCH,
    attentionItemKey: 'fuel_fraud:alert-1',
    source: 'fuel_fraud',
    baselineTier: 'T2',
    modelledAmount: 250,
    realisedAmount: 300,
    evidenceRefs: ['receipt-9981'],
    resolvedBy: 'user-1',
    resolvedAt: new Date('2026-08-01T10:00:00.000Z'),
    ...overrides,
  } as ValueLedgerEntry;
}

const emptyDataset = { rows: [], totalMatched: 0, truncated: false, exportCap: 50_000 };

describe('ledgerExportService.buildExport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetFilteredEntries.mockResolvedValue(emptyDataset);
  });

  it('threads the caller TenantContext into the repository, never falling back to an unscoped read', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);

    await ledgerExportService.buildExport(context, { format: 'json' });

    expect(mockedGetFilteredEntries).toHaveBeenCalledWith(
      { source: undefined, from: undefined, to: undefined },
      context
    );
  });

  it('passes source/from/to filters through to the repository untouched', async () => {
    const context = makeScopedContext(null);
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-31T23:59:59.000Z');

    await ledgerExportService.buildExport(context, { format: 'json', source: 'expense_anomaly', from, to });

    expect(mockedGetFilteredEntries).toHaveBeenCalledWith(
      { source: 'expense_anomaly', from, to },
      context
    );
  });

  it('reports scope.orgUnitId from context.activeOrgUnitId, null when unset', async () => {
    const scoped = makeScopedContext([HARARE_BRANCH], HARARE_BRANCH);
    const scopedResult = await ledgerExportService.buildExport(scoped, { format: 'json' });
    expect(scopedResult.scope.orgUnitId).toBe(HARARE_BRANCH);

    const orgWide = makeScopedContext(null);
    const orgWideResult = await ledgerExportService.buildExport(orgWide, { format: 'json' });
    expect(orgWideResult.scope.orgUnitId).toBeNull();
  });

  it('computes a summary that matches exactly the rows the repository returned', async () => {
    mockedGetFilteredEntries.mockResolvedValue({
      rows: [
        makeEntry({ source: 'fuel_fraud', baselineTier: 'T1', modelledAmount: 100, realisedAmount: 150 }),
        makeEntry({ source: 'fuel_fraud', baselineTier: 'T2', modelledAmount: 200, realisedAmount: 180 }),
        makeEntry({ source: 'expense_anomaly', baselineTier: 'T3', modelledAmount: 50, realisedAmount: 50 }),
      ],
      totalMatched: 3,
      truncated: false,
      exportCap: 50_000,
    });

    const context = makeScopedContext(null);
    const result = await ledgerExportService.buildExport(context, { format: 'json' });

    expect(result.summary.totalPostings).toBe(3);
    expect(result.summary.totalModelledAmount).toBe(350);
    expect(result.summary.totalRealisedAmount).toBe(380);
    expect(result.summary.totalVariance).toBe(30);
    expect(result.summary.bySource.fuel_fraud).toEqual({ count: 2, modelledAmount: 300, realisedAmount: 330 });
    expect(result.summary.bySource.expense_anomaly).toEqual({ count: 1, modelledAmount: 50, realisedAmount: 50 });
    expect(result.summary.byBaselineTier).toEqual({ T1: 1, T2: 1, T3: 1 });

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].variance).toBe(50);
    expect(result.entries[1].variance).toBe(-20);
  });

  it('does not fabricate data when the repository returns nothing: zeroed summary, empty entries', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);
    const result = await ledgerExportService.buildExport(context, { format: 'json' });

    expect(result.entries).toEqual([]);
    expect(result.summary).toEqual({
      totalPostings: 0,
      totalModelledAmount: 0,
      totalRealisedAmount: 0,
      totalVariance: 0,
      bySource: {
        fuel_fraud: { count: 0, modelledAmount: 0, realisedAmount: 0 },
        expense_anomaly: { count: 0, modelledAmount: 0, realisedAmount: 0 },
      },
      byBaselineTier: { T1: 0, T2: 0, T3: 0 },
    });
  });

  it('surfaces the repository row cap and truncation flag unchanged', async () => {
    mockedGetFilteredEntries.mockResolvedValue({
      rows: [makeEntry()],
      totalMatched: 60_000,
      truncated: true,
      exportCap: 50_000,
    });

    const context = makeScopedContext(null);
    const result = await ledgerExportService.buildExport(context, { format: 'json' });

    expect(result.truncated).toBe(true);
    expect(result.exportCap).toBe(50_000);
  });

  it('reports the applied filters back on the output, defaulting to null when omitted', async () => {
    const context = makeScopedContext(null);
    const from = new Date('2026-07-01T00:00:00.000Z');

    const withFilters = await ledgerExportService.buildExport(context, {
      format: 'json',
      source: 'fuel_fraud',
      from,
    });
    expect(withFilters.filters).toEqual({ from, to: null, source: 'fuel_fraud' });

    const withoutFilters = await ledgerExportService.buildExport(context, { format: 'json' });
    expect(withoutFilters.filters).toEqual({ from: null, to: null, source: null });
  });
});

describe('ledger-export.controller.ts resolves a full TenantContext before exporting', () => {
  it('calls resolveTenantContext(req), not a tenantId-only helper, and threads it into the service', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../modules/attention/controllers/ledger-export.controller.ts'),
      'utf8'
    );

    expect(src).toContain('resolveTenantContext(req)');
    expect(src).toContain('ledgerExportService.buildExport(context');
  });
});

describe('the export route requires the same permission every other export requires', () => {
  it('gates GET /api/attention/ledger/export behind Permission.ANALYTICS_EXPORT', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/attention/ledger/export/route.ts'),
      'utf8'
    );

    expect(src).toContain('Permission.ANALYTICS_EXPORT');
    expect(src).toContain('withAuth');
  });
});
