// tests/security/allocation-posting-wiring.spec.ts
//
// THE LEDGER WAS RECEIVING EXPENSES ONLY.
//
// AllocationPostingHandler's event map shipped as:
//
//   ExpenseCreated        -- real
//   FuelLogCreated        -- NOT AN EVENT (the name is `FuelLogged`)
//   MaintenanceCompleted  -- NOT AN EVENT (the name is `ReminderCompleted`)
//   WorkOrderCompleted    -- real, but filed under sourceCollection 'tblreminders'
//
// So fuel -- the largest operating cost in almost any fleet -- never
// posted, and neither did maintenance. `getCostPerKm` divided a real
// distance by a total missing most of its numerator and returned a
// number that looked like an answer.
//
// This is the third instance of the same defect in this codebase: a
// handler that is correctly written, correctly subscribed, and keyed on
// a name nothing publishes (see AIPredictionTriggerHandler, and the
// digital-twin/alert-store scope mismatches). Nothing throws, nothing
// logs, and the symptom is a number that is merely too low.
//
// These tests make the class impossible to reintroduce silently:
// every key in the posting map must be a registered event name that
// something actually publishes.

import * as fs from 'fs';
import * as path from 'path';
import { buildAllocationSources } from '../../modules/finance/services/allocation-source-builder';
import { buildPostingIdempotencyKey } from '../../modules/finance/services/allocation-posting.service';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const HANDLER = 'server/events/handlers/finance/AllocationPostingHandler.ts';
const handlerSrc = read(HANDLER);
const builderSrc = read('modules/finance/services/allocation-source-builder.ts');
const eventNamesSrc = read('server/events/event-names.ts');

/** `export const FUEL_LOGGED = 'FuelLogged';` -> { FUEL_LOGGED: 'FuelLogged' } */
function eventNameConstants(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of eventNamesSrc.matchAll(/export const ([A-Z0-9_]+)\s*=\s*'([^']+)'/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/** The constants used as keys of POSTING_EVENTS. */
function postingEventConstants(): string[] {
  const block = handlerSrc.slice(
    handlerSrc.indexOf('const POSTING_EVENTS'),
    handlerSrc.indexOf('export class AllocationPostingHandler')
  );
  return [...block.matchAll(/\[([A-Z0-9_]+)\]:/g)].map((m) => m[1]);
}

/** Every source file that could publish a domain event. */
function allSourceFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allSourceFiles(rel));
    else if (entry.name.endsWith('.ts') && !entry.name.includes('.spec.')) out.push(rel);
  }
  return out;
}

describe('allocation posting: every mapped event is real', () => {
  const constants = eventNameConstants();
  const mapped = postingEventConstants();

  it('maps at least the four cost sources', () => {
    expect(mapped.length).toBeGreaterThanOrEqual(4);
  });

  it('REGRESSION: uses event-name CONSTANTS, not string literals', () => {
    // String literals are what let `FuelLogCreated` and
    // `MaintenanceCompleted` sit in this map indefinitely. A constant
    // cannot be misspelled without failing to compile.
    const block = handlerSrc.slice(
      handlerSrc.indexOf('const POSTING_EVENTS'),
      handlerSrc.indexOf('export class AllocationPostingHandler')
    );
    expect(block).not.toMatch(/^\s*[A-Za-z]+:\s*\{ sourceCollection/m);
  });

  it.each(['EXPENSE_CREATED', 'FUEL_LOGGED', 'REMINDER_COMPLETED', 'WORK_ORDER_COMPLETED'])(
    '%s is mapped',
    (name) => {
      expect(mapped).toContain(name);
    }
  );

  it('every mapped constant is declared in event-names.ts', () => {
    const undeclared = mapped.filter((c) => !constants[c]);
    expect(undeclared).toEqual([]);
  });

  it('REGRESSION: no longer references the two names that never existed', () => {
    const block = handlerSrc.slice(
      handlerSrc.indexOf('const POSTING_EVENTS'),
      handlerSrc.indexOf('export class AllocationPostingHandler')
    );
    // Present in the explanatory comment above the map, absent from the
    // map body itself -- which is the part that runs.
    const body = block.slice(block.indexOf('= {'));
    expect(body).not.toContain('FuelLogCreated');
    expect(body).not.toContain('MaintenanceCompleted');
  });

  it('every mapped event is actually PUBLISHED somewhere', () => {
    // The half that a name check alone cannot give: a constant can be
    // declared and still never emitted. `TripCompleted` is exactly that
    // -- declared in event-names.ts, published by nothing.
    const sources = [
      ...allSourceFiles('modules'),
      ...allSourceFiles('server'),
      ...allSourceFiles('workers'),
    ]
      .map(read)
      .join('\n');

    const notPublished = mapped.filter((c) => {
      const literal = constants[c];
      // `super(CONST, {...})` in the event class, or the literal itself.
      return !sources.includes(`super(${c},`) && !sources.includes(`'${literal}'`);
    });
    expect(notPublished).toEqual([]);
  });
});

describe('allocation posting: provenance is honest', () => {
  it('work orders are filed under tblworkorders, not tblreminders', () => {
    // A sourceId documented as a reminder id that actually holds a
    // work-order id sends any audit following the reference to the wrong
    // collection. A ledger with a wrong provenance pointer is worse than
    // one with none.
    const block = handlerSrc.slice(
      handlerSrc.indexOf('const POSTING_EVENTS'),
      handlerSrc.indexOf('export class AllocationPostingHandler')
    );
    expect(block).toMatch(/WORK_ORDER_COMPLETED\]:\s*\{\s*sourceCollection:\s*'tblworkorders'/);
  });

  it("'tblworkorders' is a declared source collection", () => {
    expect(read('modules/finance/types/allocation.types.ts')).toContain("| 'tblworkorders'");
  });
});

describe('allocation posting: the period is the record date, not "now"', () => {
  it('REGRESSION: does not fall back to new Date() for the posting period', () => {
    // `payload.date ? new Date(payload.date) : new Date()` dated every
    // posting to whenever the handler happened to run, because no event
    // carried a date. On an append-only ledger a cost in the wrong
    // period cannot be edited out.
    expect(handlerSrc).not.toMatch(/payload\.date\s*\?\s*new Date\([^)]*\)\s*:\s*new Date\(\)/);
    expect(builderSrc).not.toMatch(/\?\?\s*new Date\(\)/);
  });

  it('the events now carry their record date', () => {
    expect(read('modules/fuel/events/FuelLoggedEvent.ts')).toMatch(/date:\s*fuelLog\.date/);
    expect(read('modules/maintenance/events/ReminderCompletedEvent.ts')).toMatch(/date:\s*reminder\./);
    expect(read('modules/workorders/events/workorder.events.ts')).toMatch(/date:\s*wo\.completedAt/);
  });

  it('fuel carries its currency, so a posting is never converted at an assumed 1:1', () => {
    expect(read('modules/fuel/events/FuelLoggedEvent.ts')).toMatch(/currency:\s*fuelLog\.currency/);
  });
});

/**
 * BEHAVIOURAL, NOT TEXTUAL.
 *
 * These four were source-text assertions on AllocationPostingHandler
 * (`expect(handlerSrc).toMatch(/Work order parts/)` and friends). They
 * broke the moment the posting rules were extracted into
 * allocation-source-builder.ts so the historical backfill could produce
 * byte-identical postings -- a refactor that made the code STRICTLY
 * better and the tests red.
 *
 * That is the same weakness as the `expect(code).toContain('FuelLogCreated')`
 * assertion that pinned the dead event name in place: matching source
 * text proves a literal is present, not that it means anything. The
 * rules now live in a pure function, so they are asserted by calling it.
 */
describe('buildAllocationSources: the rules that move money', () => {
  const WORK_ORDER_SPEC = {
    sourceCollection: 'tblworkorders' as const,
    costCategory: 'maintenance' as const,
  };
  const REMINDER_SPEC = {
    sourceCollection: 'tblreminders' as const,
    costCategory: 'maintenance' as const,
  };
  const FUEL_SPEC = { sourceCollection: 'tblfuellogs' as const, costCategory: 'fuel' as const };

  const base = { sourceId: 'src-1', vehicleId: 'veh-1' };

  it('refuses a record with no date rather than dating it to now', () => {
    const result = buildAllocationSources({
      ...base,
      spec: FUEL_SPEC,
      record: { cost: 100 },
    });
    expect(result.sources).toEqual([]);
    expect(result.refusal).toMatch(/no usable date/i);
  });

  it('refuses an unparseable date too', () => {
    const result = buildAllocationSources({
      ...base,
      spec: FUEL_SPEC,
      record: { cost: 100, date: 'not a date' },
    });
    expect(result.sources).toEqual([]);
    expect(result.refusal).toBeTruthy();
  });

  it('takes the period from the record, to the millisecond', () => {
    const { sources } = buildAllocationSources({
      ...base,
      spec: FUEL_SPEC,
      record: { cost: 100, date: '2026-03-14T09:30:00.000Z' },
    });
    expect(sources[0].occurredAt.toISOString()).toBe('2026-03-14T09:30:00.000Z');
  });

  it('posts parts and labour separately, under different cost categories', () => {
    const { sources } = buildAllocationSources({
      ...base,
      spec: WORK_ORDER_SPEC,
      record: { completedAt: '2026-03-01T00:00:00Z', partsCost: 120, laborCost: 80, totalCost: 200 },
    });

    expect(sources).toHaveLength(2);
    expect(sources.map((s) => [s.costCategory, s.amount])).toEqual([
      ['maintenance', 120],
      ['other', 80],
    ]);
  });

  it('REGRESSION: does not post the total alongside the components', () => {
    // Posting totalCost as well would double-count the work order, and
    // an append-only ledger needs a human reversal to undo that.
    const { sources } = buildAllocationSources({
      ...base,
      spec: WORK_ORDER_SPEC,
      record: { completedAt: '2026-03-01T00:00:00Z', partsCost: 120, laborCost: 80, totalCost: 200 },
    });
    expect(sources.reduce((sum, s) => sum + s.amount, 0)).toBe(200);
    expect(sources.some((s) => s.amount === 200)).toBe(false);
  });

  it('falls back to the total ONLY when neither component exists', () => {
    const { sources } = buildAllocationSources({
      ...base,
      spec: WORK_ORDER_SPEC,
      record: { completedAt: '2026-03-01T00:00:00Z', totalCost: 200 },
    });
    expect(sources).toHaveLength(1);
    expect(sources[0].amount).toBe(200);
    expect(sources[0].description).toMatch(/split unavailable/);
  });

  it('refuses a work order that records no money at all', () => {
    const result = buildAllocationSources({
      ...base,
      spec: WORK_ORDER_SPEC,
      record: { completedAt: '2026-03-01T00:00:00Z' },
    });
    expect(result.sources).toEqual([]);
    expect(result.refusal).toBeTruthy();
  });

  it('says on the posting that a reminder cost is an estimate', () => {
    // Reminder has no actuals field. A finance user reconciling an
    // estimate against an invoice must not conclude the ledger is wrong.
    const { sources } = buildAllocationSources({
      ...base,
      spec: REMINDER_SPEC,
      record: { completion_date: '2026-03-01T00:00:00Z', cost: 50 },
    });
    expect(sources[0].description).toMatch(/estimated cost/i);
  });

  it("carries the record's own currency, and omits it when absent", () => {
    const withCurrency = buildAllocationSources({
      ...base,
      spec: FUEL_SPEC,
      record: { date: '2026-03-01T00:00:00Z', cost: 100, currency: 'ZWL' },
    });
    expect(withCurrency.sources[0].currency).toBe('ZWL');

    const without = buildAllocationSources({
      ...base,
      spec: FUEL_SPEC,
      record: { date: '2026-03-01T00:00:00Z', cost: 100 },
    });
    // Absent means "the tenant's reporting currency", resolved
    // downstream. Defaulting it here would hard-code an assumption the
    // finance settings own.
    expect(without.sources[0]).not.toHaveProperty('currency');
  });

  it('maps driver_id onto the ledger\'s driverId, in one place', () => {
    // The handler read only `payload.driverId`, which no event has ever
    // published -- every operational record spells it `driver_id`. So the
    // ledger's driver column has always been empty.
    const { sources } = buildAllocationSources({
      ...base,
      spec: FUEL_SPEC,
      record: { date: '2026-03-01T00:00:00Z', cost: 100, driver_id: 'drv-1' },
    });
    expect(sources[0].driverId).toBe('drv-1');
  });

  it('refuses when the vehicle could not be resolved', () => {
    // Posting against no vehicle would produce a cost belonging to
    // nothing, invisible to every scoped reader and still counted in
    // totals.
    const result = buildAllocationSources({
      ...base,
      vehicleId: '',
      spec: FUEL_SPEC,
      record: { date: '2026-03-01T00:00:00Z', cost: 100 },
    });
    expect(result.sources).toEqual([]);
    expect(result.refusal).toMatch(/vehicle/i);
  });

  it('the two work-order postings cannot collide on the idempotency key', () => {
    // The key includes costCategory precisely so one source record can
    // produce several postings.
    const keys = new Set(
      buildAllocationSources({
        ...base,
        spec: WORK_ORDER_SPEC,
        record: { completedAt: '2026-03-01T00:00:00Z', partsCost: 120, laborCost: 80 },
      }).sources.map((s) =>
        buildPostingIdempotencyKey({
          tenantId: 't',
          sourceCollection: s.sourceCollection,
          sourceId: s.sourceId,
          costCategory: s.costCategory,
        })
      )
    );
    expect(keys.size).toBe(2);
  });
});
