// tests/security/allocation-backfill-safety.spec.ts
//
// `npm run finance:backfill-ledger` posts HISTORICAL fuel, expense,
// maintenance and work-order records into an APPEND-ONLY ledger.
//
// ---------------------------------------------------------------------
// WHY THIS IS TESTED AT ALL
// ---------------------------------------------------------------------
// Nothing this script writes can be edited or deleted afterwards. A
// wrong posting is corrected only by a human noticing a plausible-looking
// number and making a reversing entry. So the properties that matter are
// not "does it work" but "what does it REFUSE to do":
//
//   * post the same record twice
//   * date a posting to now when the record has no date
//   * guess which vehicle an ambiguous plate means
//   * post a reminder or work order that has not been completed
//   * run against every customer at once without being told to
//
// The posting rules themselves are covered behaviourally in
// allocation-posting-wiring.spec.ts, against the same shared
// `buildAllocationSources` this script uses -- which is the point of
// extracting it: the live path and the backfill cannot disagree about
// what a work order costs.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = 'scripts/backfill-allocation-ledger.ts';
const src = fs.readFileSync(path.join(ROOT, SCRIPT), 'utf8');

/** Comments quote the defects; a code check must not read prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const code = stripComments(src);

describe('the backfill shares the live posting rules rather than copying them', () => {
  it('builds its sources with buildAllocationSources', () => {
    // The whole reason that function was extracted. A second copy of
    // "a work order is parts plus labour, and the total only when
    // neither exists" is how the backfill and the event path come to
    // hold two different answers for the same month.
    expect(code).toMatch(/buildAllocationSources\(/);
  });

  it('posts through allocationPostingService, not straight into the collection', () => {
    // Writing to tblallocationledger directly would bypass the currency
    // resolution, the org-unit derivation from the vehicle, AND the
    // idempotency key that makes a re-run safe.
    expect(code).toMatch(/allocationPostingService\.postSource\(/);
    expect(code).not.toMatch(/collection\(['"]tblallocationledger['"]\)/);
  });

  it('never updates or deletes anything', () => {
    // The ledger is append-only. Even a "fix" written here would be a
    // silent rewrite of something a finance team may already have
    // reconciled.
    for (const forbidden of ['updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'drop(']) {
      expect({ forbidden, present: code.includes(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
    }
  });
});

describe('it cannot double-post', () => {
  it('relies on the deterministic idempotency key rather than its own state', () => {
    // A checkpoint file can be lost, stale, or written after a crash.
    // The partial unique index cannot. This asserts the script does not
    // invent a second mechanism that could disagree with the first.
    expect(code).not.toMatch(/checkpoint|lastProcessedId|resumeToken/i);
  });

  it('counts a duplicate as a duplicate instead of treating it as failure', () => {
    // A re-run is EXPECTED to find most records already posted. If that
    // read as an error the operator would stop trusting the report.
    expect(code).toMatch(/status === 'duplicate'/);
  });

  it('tells the operator to create the unique index first', () => {
    // Without it the guarantee is application-level only and two
    // concurrent runs could each pass the read-before-write.
    expect(src).toMatch(/db:indexes/);
  });
});

describe('it refuses rather than guesses', () => {
  it('refuses a plate that matches more than one active vehicle', () => {
    // Real in this deployment: two organizations are both named "Toyota
    // Zimbabwe", and plates carry no unique index. Picking the first
    // match files a cost against the wrong truck, permanently.
    expect(code).toMatch(/matches\.length > 1/);
    expect(src).toMatch(/NEVER GUESSES/);
  });

  it('refuses a plate that matches no vehicle', () => {
    expect(code).toMatch(/matches\.length === 0/);
  });

  it('never dates a posting to now', () => {
    // The refusal lives in buildAllocationSources; this asserts the
    // script does not paper over it with a fallback of its own.
    expect(code).not.toMatch(/\?\?\s*new Date\(\)/);
    expect(code).not.toMatch(/\|\|\s*new Date\(\)/);
  });
});

describe('only completed work is treated as a cost', () => {
  it('backfills COMPLETED reminders and work orders only', () => {
    // An outstanding reminder has incurred no cost yet. Posting its
    // estimate would put money in the ledger for work nobody has done --
    // and on an append-only ledger, taking it back out needs a human.
    const definitions = code.slice(code.indexOf('const SOURCES'), code.indexOf('const argv'));
    const completedFilters = definitions.match(/filter:\s*\{\s*status:\s*'completed'\s*\}/g) ?? [];
    expect(completedFilters).toHaveLength(2);
  });

  it('dates maintenance by completion and work orders by completedAt', () => {
    // Not by due date. A service completed three weeks late belongs to
    // the period it was done in, which is the period its invoice lands
    // in.
    const definitions = code.slice(code.indexOf('const SOURCES'), code.indexOf('const argv'));
    expect(definitions).toMatch(/dateField:\s*'completion_date'/);
    expect(definitions).toMatch(/dateField:\s*'completedAt'/);
  });
});

describe('operator safety', () => {
  it('is a dry run unless --confirm is passed', () => {
    expect(code).toMatch(/const CONFIRM = argv\.includes\('--confirm'\)/);
    expect(code).toMatch(/if \(!CONFIRM\)/);
  });

  it('refuses a multi-tenant database without --tenant', () => {
    // Backfilling every customer's ledger in one command is almost never
    // what is meant, and it is not undoable.
    expect(code).toMatch(/tenants\.length > 1 && !ALL_TENANTS/);
    expect(code).toMatch(/--yes-all-tenants/);
  });

  it('supports a period window, and says loudly when there is none', () => {
    // Which months are closed in the customer's own general ledger is a
    // finance decision. Posting into a closed period is the failure this
    // warning exists to prevent.
    expect(code).toMatch(/--from/);
    expect(code).toMatch(/--to/);
    expect(src).toMatch(/closed in your own general ledger/);
  });

  it('rejects an unparseable date instead of silently ignoring it', () => {
    // `--from 2026-13-45` quietly becoming "no lower bound" would post
    // the entire history when the operator asked for one month.
    expect(code).toMatch(/Number\.isNaN\(parsed\.getTime\(\)\)/);
    expect(code).toMatch(/process\.exit\(1\)/);
  });

  it('rejects an unknown --sources value', () => {
    // A typo'd source name silently backfilling nothing looks identical
    // to a clean run.
    expect(code).toMatch(/Unknown --sources/);
  });

  it('writes an audit record when it applies', () => {
    expect(code).toMatch(/tbltenant_repair_audit/);
    expect(code).toMatch(/ALLOCATION_LEDGER_BACKFILL/);
  });

  it('streams the source collection rather than loading it', () => {
    // Fuel history is the largest collection after telemetry. `.toArray()`
    // on it is how a backfill dies on a worker at 3am.
    expect(code).toMatch(/for await \(const record of cursor\)/);
  });

  it('caps the refusals it prints', () => {
    // A report nobody can read is a report nobody reads.
    expect(code).toMatch(/MAX_REPORTED_REFUSALS/);
  });
});

describe('it is registered so an operator can actually run it', () => {
  it('has an npm script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['finance:backfill-ledger']).toBe('tsx scripts/backfill-allocation-ledger.ts');
  });
});
