// tests/security/ai-evidence-emission.spec.ts
//
// BACKLOG ITEM 7 (audit finding P6-N2).
//
// THE DEFECT: `ai-evidence.types.ts` defined the shared envelope and
// `assertEvidence` to guard it, and not one of the AI services emitted
// it. So every `confidence: 0.83` in the product was unfalsifiable --
// and BACKLOG ITEM 6 now lets those numbers raise real work orders.
//
// The finding also warned about the wrong fix: "evidence arrays that
// technically satisfy the guard while pointing at nothing useful --
// worse than none, because it looks audited". So this suite asserts
// more than non-emptiness. It asserts that every reference is a stored
// record id a reader could actually fetch, from the collection the
// entry names.

import {
  evidenceFromRows,
  evidenceFromRow,
  mergeEvidence,
  MAX_EVIDENCE_REFS,
} from '@/modules/ai/services/ai-evidence.builders';
import { assertEvidence, buildConfidence, MissingEvidenceError } from '@/modules/ai/types/ai-evidence.types';
import type { AIEvidence } from '@/modules/ai/types/ai-evidence.types';

/** Every entry must name a collection and a fetchable id. */
function expectUsableEvidence(evidence: AIEvidence[] | undefined): void {
  expect(evidence).toBeDefined();
  expect(evidence!.length).toBeGreaterThan(0);
  for (const entry of evidence!) {
    expect(typeof entry.source).toBe('string');
    expect(entry.source.length).toBeGreaterThan(0);
    expect(typeof entry.reference).toBe('string');
    expect(entry.reference.length).toBeGreaterThan(0);
    // The failure mode the finding named: a placeholder that satisfies
    // the guard and resolves to nothing.
    expect(['undefined', 'null', 'unknown', 'computed', 'N/A', '[object Object]']).not.toContain(
      entry.reference
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
describe('the builder refuses to fabricate a reference', () => {
  it('drops rows with no usable id rather than citing a placeholder', () => {
    const evidence = evidenceFromRows('tblfuellogs', [
      { _id: 'log-1' },
      { _id: undefined },
      { _id: null },
      { notAnId: 'x' },
      { _id: 'log-2' },
    ]);

    expect(evidence.map((e) => e.reference)).toEqual(['log-1', 'log-2']);
  });

  it('rejects an id that stringifies to [object Object]', () => {
    // A row whose _id was populated with a document rather than an id
    // must not become a reference nobody can resolve.
    expect(evidenceFromRows('tblfuellogs', [{ _id: { nested: true } }])).toEqual([]);
  });

  it('coerces an ObjectId-like id to its printable form', () => {
    // BaseRepository declares _id as a string while Mongo returns an
    // ObjectId -- the type lie this codebase has been bitten by. A
    // reference must be the same printable id either way.
    const objectIdLike = { toString: () => '68b0f1a2c3d4e5f601234567' };
    const [entry] = evidenceFromRows('tblexpenses', [{ _id: objectIdLike }]);
    expect(entry.reference).toBe('68b0f1a2c3d4e5f601234567');
  });

  it('returns an empty array for no rows, so the caller can omit the field', () => {
    expect(evidenceFromRows('tblfuellogs', [])).toEqual([]);
    expect(evidenceFromRow('tblvehicles', null)).toEqual([]);
    expect(evidenceFromRow('tblvehicles', undefined)).toEqual([]);
  });

  it('carries the fact s own timestamp, not now', () => {
    const observed = new Date('2026-03-14T08:00:00Z');
    const [entry] = evidenceFromRows('tblfuellogs', [{ _id: 'l1', date: observed }], {
      observedAtField: 'date',
    });
    expect(entry.observedAt).toEqual(observed);
  });

  it('carries the value that drove the finding when one is named', () => {
    const [entry] = evidenceFromRows('tblexpenses', [{ _id: 'e1', amount: 1250.5 }], {
      valueField: 'amount',
    });
    expect(entry.value).toBe(1250.5);
  });

  it('omits a non-finite value rather than storing NaN', () => {
    const [entry] = evidenceFromRows('tblexpenses', [{ _id: 'e1', amount: Number.NaN }], {
      valueField: 'amount',
    });
    expect('value' in entry).toBe(false);
  });

  it('caps the sample and orders it deterministically, newest first', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      _id: `r-${i}`,
      timestamp: new Date(2026, 0, 1 + i),
    }));

    const first = evidenceFromRows('tbltelematics', rows, { observedAtField: 'timestamp' });
    const second = evidenceFromRows('tbltelematics', [...rows].reverse(), {
      observedAtField: 'timestamp',
    });

    expect(first).toHaveLength(MAX_EVIDENCE_REFS);
    // Reproducible: two runs over the same data cite the same rows,
    // whatever order the repository happened to return them in.
    expect(second.map((e) => e.reference)).toEqual(first.map((e) => e.reference));
    expect(first[0].reference).toBe('r-49');
  });

  it('merges without citing the same record twice', () => {
    const merged = mergeEvidence([
      evidenceFromRows('tblfuellogs', [{ _id: 'l1' }, { _id: 'l2' }]),
      evidenceFromRows('tblfuellogs', [{ _id: 'l2' }, { _id: 'l3' }]),
    ]);

    // A row read through two paths must not make the sample look
    // broader than it is.
    expect(merged.map((e) => e.reference)).toEqual(['l1', 'l2', 'l3']);
  });

  it('treats the same id in two collections as two distinct facts', () => {
    const merged = mergeEvidence([
      evidenceFromRows('tblfuellogs', [{ _id: 'shared-id' }]),
      evidenceFromRows('tblexpenses', [{ _id: 'shared-id' }]),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('respects the cap when merging', () => {
    const merged = mergeEvidence([
      evidenceFromRows('a', Array.from({ length: 15 }, (_, i) => ({ _id: `a${i}` }))),
      evidenceFromRows('b', Array.from({ length: 15 }, (_, i) => ({ _id: `b${i}` }))),
    ]);
    expect(merged).toHaveLength(MAX_EVIDENCE_REFS);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('the guard that has existed since Phase 6 now has callers', () => {
  it('still refuses an empty envelope', () => {
    expect(() => assertEvidence({ evidence: [] }, 'test prediction')).toThrow(MissingEvidenceError);
  });

  it('accepts an envelope built from real rows', () => {
    const envelope = buildConfidence({
      confidence: 0.83,
      evidence: evidenceFromRows('tblfuellogs', [{ _id: 'l1' }, { _id: 'l2' }]),
      what: 'fuel fraud alert',
    });
    expect(envelope.evidence).toHaveLength(2);
    expect(envelope.confidence).toBe(0.83);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('services emit evidence pointing at the rows they read', () => {
  const VEHICLE = { _id: 'vehicle-1', license_plate: 'ADY2531', orgUnitId: 'unit-harare' };

  it('fuel fraud cites the fuel logs and the vehicle', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FuelFraudDetectionService } = require('@/modules/ai/services/fuel-fraud-detection.service');
      const service = new FuelFraudDetectionService();

      const fuelLogs = Array.from({ length: 12 }, (_, i) => ({
        _id: `fuel-${i}`,
        license_plate: 'ADY2531',
        date: new Date(2026, 5, i + 1),
        fuel_volume: i === 5 ? 300 : 40,
        cost: i === 5 ? 4500 : 600,
        odometer: 10_000 + i * 400,
      }));

      const result = service.buildFraudAlert(VEHICLE, fuelLogs);

      expect(result.success).toBe(true);
      expectUsableEvidence(result.data.evidence);
      // The logs ARE the computation, so they must be cited.
      expect(result.data.evidence.some((e: AIEvidence) => e.source === 'tblfuellogs')).toBe(true);
      // The baseline is per-vehicle, so the vehicle is an input too.
      expect(result.data.evidence.some((e: AIEvidence) => e.source === 'tblvehicles')).toBe(true);
      // Every reference is one of the rows actually read.
      const cited = result.data.evidence
        .filter((e: AIEvidence) => e.source === 'tblfuellogs')
        .map((e: AIEvidence) => e.reference);
      expect(cited.every((ref: string) => fuelLogs.some((l) => l._id === ref))).toBe(true);
    });
  });

  it('expense anomaly cites the expense row the alert is about', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {
        ExpenseAnomalyDetectionService,
      } = require('@/modules/ai/services/expense-anomaly-detection.service');
      const service = new ExpenseAnomalyDetectionService();

      const expense = {
        _id: 'expense-77',
        license_plate: 'ADY2531',
        amount: 9500,
        date: new Date('2026-06-02T03:00:00Z'),
        expense_type: 'repair',
      };

      const alert = service.createAlert(
        expense,
        [
          {
            type: 'amount',
            expected: 500,
            actual: 9500,
            deviation: 9000,
            percentageDeviation: 1800,
            description: 'far above baseline',
          },
        ],
        'tenant-a'
      );

      expectUsableEvidence(alert.evidence);
      expect(alert.evidence).toEqual([
        expect.objectContaining({
          source: 'tblexpenses',
          reference: 'expense-77',
          value: 9500,
        }),
      ]);
    });
  });

  it('the intelligence anomaly detector cites the two refuels it compared', async () => {
    const fuelLogs = [
      { _id: 'log-a', license_plate: 'ADY2531', date: new Date(2026, 0, 1), odometer: 1000, fuel_volume: 50 },
      { _id: 'log-b', license_plate: 'ADY2531', date: new Date(2026, 0, 5), odometer: 1500, fuel_volume: 50 },
      { _id: 'log-c', license_plate: 'ADY2531', date: new Date(2026, 0, 9), odometer: 2000, fuel_volume: 50 },
      // A refuel that covered far less distance for the same volume.
      { _id: 'log-d', license_plate: 'ADY2531', date: new Date(2026, 0, 13), odometer: 2050, fuel_volume: 50 },
    ];

    jest.resetModules();
    jest.doMock('@/modules/fuel/repositories/fuel.repository', () => ({
      fuelRepository: { findMany: jest.fn(async () => fuelLogs) },
    }));
    jest.doMock('@/modules/expenses/repositories/expense.repository', () => ({
      expenseRepository: { findMany: jest.fn(async () => []) },
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AnomalyDetectionService } = require('@/modules/intelligence/services/anomaly-detection.service');
    const detected = await new AnomalyDetectionService().detectFuelAnomalies('tenant-a');

    expect(detected.length).toBeGreaterThan(0);
    for (const anomaly of detected) {
      expectUsableEvidence(anomaly.evidence);
      // Exactly the pair the efficiency figure was computed from --
      // not the whole vehicle history.
      expect(anomaly.evidence).toHaveLength(2);
      expect(anomaly.evidence.every((e: AIEvidence) => e.source === 'tblfuellogs')).toBe(true);
      expect(
        anomaly.evidence.every((e: AIEvidence) => fuelLogs.some((l) => l._id === e.reference))
      ).toBe(true);
    }

    jest.dontMock('@/modules/fuel/repositories/fuel.repository');
    jest.dontMock('@/modules/expenses/repositories/expense.repository');
    jest.resetModules();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('an item that can be acted on carries what it rests on', () => {
  it('persists evidence onto the attention item, so a dispatch can be explained later', async () => {
    // BACKLOG ITEM 6 lets an item raise a work order. "Why did the
    // platform create this job?" cannot be answered from a value that
    // only existed in the live feed at the moment of dispatch.
    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AttentionItemRepository } = require('@/modules/attention/repositories/attention-item.repository');
    const repo = new AttentionItemRepository();

    const ops: Array<{ updateOne: { update: { $set: Record<string, unknown> } } }> = [];
    (repo as unknown as { getCollection: () => Promise<unknown> }).getCollection = async () => ({
      bulkWrite: async (received: typeof ops) => {
        ops.push(...received);
        return { upsertedCount: 1, modifiedCount: 0, matchedCount: 0 };
      },
    });

    const evidence: AIEvidence[] = [{ source: 'tblfuellogs', reference: 'log-1' }];

    await repo.upsertFeedItems('tenant-a', [
      {
        item: {
          id: 'fuel_fraud:alert-1',
          source: 'fuel_fraud',
          severity: 'high',
          urgency: 'soon',
          title: 'Possible fuel fraud',
          description: 'x',
          cost: 100,
          priorityScore: 50,
          evidence,
        },
        orgUnitId: 'unit-harare',
      },
      {
        item: {
          id: 'fleet_health:capacity-0',
          source: 'fleet_health',
          severity: 'medium',
          urgency: 'planned',
          title: 'Fleet capacity',
          description: 'y',
          cost: 0,
          priorityScore: 10,
        },
        orgUnitId: null,
      },
    ]);

    expect(ops[0].updateOne.update.$set.evidence).toEqual(evidence);
    // null, not [] -- an empty array reads as "we checked and found
    // nothing", which is a different claim from "nothing was recorded".
    expect(ops[1].updateOne.update.$set.evidence).toBeNull();

    jest.resetModules();
  });
});
