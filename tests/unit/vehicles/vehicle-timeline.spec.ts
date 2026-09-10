// tests/unit/vehicles/vehicle-timeline.spec.ts
//
// The Vehicle Detail activity tab used to render the AUDIT LOG only, so
// a truck refuelled eleven times and serviced twice showed:
//
//     Vehicle updated
//     Vehicle created
//
// buildVehicleTimeline merges the vehicle's own operational records with
// those record changes. It is a pure function because jest runs
// `testEnvironment: 'node'` here with no jsdom -- a decision made inside
// a component could not be tested at all.
//
// The assertions that matter are about HONESTY, not formatting: what
// happens to a record with no date, whether a completed service is dated
// by its completion, and whether the order is stable.

import {
  buildVehicleTimeline,
  humaniseAuditAction,
  toIsoDate,
} from '../../../frontend/modules/vehicles/utils/vehicle-timeline';

describe('toIsoDate', () => {
  it('accepts a Date, an ISO string and an epoch number', () => {
    expect(toIsoDate(new Date('2026-09-01T06:00:00Z'))).toBe('2026-09-01T06:00:00.000Z');
    expect(toIsoDate('2026-09-01T06:00:00Z')).toBe('2026-09-01T06:00:00.000Z');
    expect(toIsoDate(Date.UTC(2026, 8, 1, 6))).toBe('2026-09-01T06:00:00.000Z');
  });

  it('returns null for every shape of "no date"', () => {
    // `new Date(undefined)` is Invalid Date and `new Date(null)` is the
    // EPOCH -- two different wrong answers from the same careless call.
    // That asymmetry is the reason this helper exists.
    expect(toIsoDate(undefined)).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate('')).toBeNull();
    expect(toIsoDate('not a date')).toBeNull();
    expect(toIsoDate(new Date('nonsense'))).toBeNull();
    expect(toIsoDate({})).toBeNull();
  });
});

describe('buildVehicleTimeline', () => {
  it('merges every source into one list, newest first', () => {
    const { entries } = buildVehicleTimeline({
      fuel: [{ _id: 'f1', date: '2026-09-03T08:00:00Z', fuel_volume: 50, cost: 100, currency: 'USD' }],
      expenses: [{ _id: 'e1', date: '2026-09-05T08:00:00Z', amount: 40, description: 'Tollgate' }],
      trips: [{ _id: 't1', date: '2026-09-01T08:00:00Z', distance_calculated: 120 }],
      maintenance: [{ _id: 'm1', due_date: '2026-09-04T08:00:00Z', title: 'Service A', status: 'pending' }],
      workOrders: [{ _id: 'w1', openedAt: '2026-09-02T08:00:00Z', title: 'Mirror', status: 'open' }],
      audit: [{ _id: 'a1', createdAt: '2026-08-31T08:00:00Z', action: 'VEHICLE_UPDATED' }],
    });

    expect(entries.map((e) => e.kind)).toEqual([
      'expense',
      'maintenance',
      'fuel',
      'work-order',
      'trip',
      'audit',
    ]);
  });

  it('THE RULE: a record with no date is excluded and counted, never dated to now', () => {
    // Dating it to now puts an eight-month-old refuel at the top of the
    // history; dating it to the epoch buries it and still asserts a date
    // nobody recorded; dropping it silently makes this screen disagree
    // with the module it summarises.
    const { entries, undatedCount } = buildVehicleTimeline({
      fuel: [
        { _id: 'f1', date: '2026-09-03T08:00:00Z', fuel_volume: 50 },
        { _id: 'f2', fuel_volume: 40 },
        { _id: 'f3', date: null, fuel_volume: 30 },
      ],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('fuel:f1');
    expect(undatedCount).toBe(2);
  });

  it('dates a completed service by its completion, not by when it fell due', () => {
    // A service done three weeks late belongs on the day it was done. If
    // it were placed on the due date it would sort before the work it
    // actually followed.
    const { entries } = buildVehicleTimeline({
      maintenance: [
        {
          _id: 'm1',
          title: 'Service A',
          status: 'completed',
          due_date: '2026-08-01T00:00:00Z',
          completion_date: '2026-08-22T00:00:00Z',
        },
      ],
    });

    expect(entries[0].at).toBe('2026-08-22T00:00:00.000Z');
    expect(entries[0].detail).toContain('Completed');
  });

  it('dates a work order by when it was OPENED, so open jobs are visible', () => {
    // Dating by completedAt would hide every job still in the workshop --
    // exactly the ones a manager is looking for.
    const { entries } = buildVehicleTimeline({
      workOrders: [
        { _id: 'w1', title: 'Brakes', status: 'in_progress', openedAt: '2026-09-01T00:00:00Z' },
      ],
    });

    expect(entries[0].at).toBe('2026-09-01T00:00:00.000Z');
    expect(entries[0].detail).toContain('in progress');
  });

  it('orders deterministically when two records share a timestamp', () => {
    // Common on an import. A list that reorders itself between renders
    // looks broken even when the data is right.
    const sources = {
      fuel: [{ _id: 'f2', date: '2026-09-01T00:00:00Z' }, { _id: 'f1', date: '2026-09-01T00:00:00Z' }],
    };
    const first = buildVehicleTimeline(sources).entries.map((e) => e.id);
    const second = buildVehicleTimeline(sources).entries.map((e) => e.id);

    expect(first).toEqual(second);
    expect(first).toEqual(['fuel:f1', 'fuel:f2']);
  });

  it('links a trip to its own page and leaves the rest unlinked', () => {
    const { entries } = buildVehicleTimeline({
      trips: [{ _id: 't1', date: '2026-09-01T00:00:00Z', distance_calculated: 10 }],
      fuel: [{ _id: 'f1', date: '2026-09-02T00:00:00Z' }],
    });

    expect(entries.find((e) => e.kind === 'trip')?.href).toBe('/trips/t1');
    // Fuel logs have no detail page in this product; a link to nowhere
    // is worse than no link.
    expect(entries.find((e) => e.kind === 'fuel')?.href).toBeUndefined();
  });

  it('omits an amount it cannot render rather than printing 0', () => {
    // `cost: undefined` becoming "0.00" would assert a free refuel.
    const { entries } = buildVehicleTimeline({
      fuel: [{ _id: 'f1', date: '2026-09-01T00:00:00Z', fuel_volume: 50 }],
    });

    expect(entries[0].detail).toBe('50 L');
    expect(entries[0].detail).not.toContain('0.00');
  });

  it('renders nothing, and no error, for a vehicle with no records', () => {
    expect(buildVehicleTimeline({})).toEqual({ entries: [], undatedCount: 0 });
  });

  it('survives records missing every optional field', () => {
    // Real data from this deployment includes rows with almost nothing
    // on them; the panel must not throw on one of them.
    const { entries } = buildVehicleTimeline({
      fuel: [{ date: '2026-09-01T00:00:00Z' }],
      expenses: [{ date: '2026-09-01T00:00:00Z' }],
      trips: [{ date: '2026-09-01T00:00:00Z' }],
      maintenance: [{ due_date: '2026-09-01T00:00:00Z' }],
      workOrders: [{ openedAt: '2026-09-01T00:00:00Z' }],
      audit: [{ createdAt: '2026-09-01T00:00:00Z' }],
    });

    expect(entries).toHaveLength(6);
    for (const entry of entries) {
      expect(typeof entry.title).toBe('string');
      expect(entry.title.length).toBeGreaterThan(0);
      // A generated id must still be unique, or React keys collide.
      expect(entry.id).toBeTruthy();
    }
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });
});

describe('humaniseAuditAction', () => {
  it('turns a constant into a sentence', () => {
    expect(humaniseAuditAction('VEHICLE_UPDATED')).toBe('Vehicle updated');
    expect(humaniseAuditAction('vehicle.driver.assigned')).toBe('Vehicle driver assigned');
  });

  it('falls back rather than rendering an empty line', () => {
    expect(humaniseAuditAction('')).toBe('Record changed');
    expect(humaniseAuditAction('___')).toBe('Record changed');
  });
});
