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

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const HANDLER = 'server/events/handlers/finance/AllocationPostingHandler.ts';
const handlerSrc = read(HANDLER);
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
  });

  it('refuses to post a source with no date', () => {
    expect(handlerSrc).toMatch(/carries no date; refusing to post/);
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

describe('allocation posting: a work order is two costs', () => {
  it('posts parts and labour separately', () => {
    expect(handlerSrc).toMatch(/Work order parts/);
    expect(handlerSrc).toMatch(/Work order labour/);
  });

  it('REGRESSION: does not post the total alongside the components', () => {
    // Posting totalCost as well would double-count the work order, and
    // an append-only ledger needs a human reversal to undo that.
    expect(handlerSrc).toMatch(/if \(out\.length === 0\)/);
    expect(handlerSrc).toMatch(/split unavailable/);
  });

  it('the two postings cannot collide on the idempotency key', () => {
    // The key includes costCategory precisely so one source record can
    // produce several postings.
    const service = read('modules/finance/services/allocation-posting.service.ts');
    expect(service).toMatch(/costCategory/);
    expect(service).toMatch(/idempotencyKey|buildPostingIdempotencyKey/);
  });
});

describe('allocation posting: maintenance estimates are labelled', () => {
  it('says on the posting that a reminder cost is an estimate', () => {
    // Reminder has no actuals field. A finance user reconciling an
    // estimate against an invoice must not conclude the ledger is wrong.
    expect(handlerSrc).toMatch(/estimated cost -- no actuals recorded/);
  });
});
