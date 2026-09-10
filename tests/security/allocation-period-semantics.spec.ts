// tests/security/allocation-period-semantics.spec.ts
//
// "The lines must add up to the total above them."
//
// ---------------------------------------------------------------------
// THE DISAGREEMENT
// ---------------------------------------------------------------------
// Two period semantics coexisted in one repository:
//
//   buildFilter        (the LIST endpoint -- the drill-down a finance
//                       user opens to see what makes up a figure)
//                       constrained periodStart ALONE: "starts within
//                       the window".
//
//   getNetTotalsBy*    (every path that produces MONEY, including
//                       cost-per-km and GL reconciliation) required both
//                       ends inside: "fully contained".
//
// They agree for every auto-posted transaction, because a dated fuel log
// posts with periodStart === periodEnd. They disagree for a SPREAD
// posting -- depreciation, a shared cost -- that starts inside the
// window and ends after it: the drill-down listed it, the header did not
// count it. On a screen whose entire purpose is that the lines explain
// the total.
//
// Standardised on FULLY CONTAINED, because that is what the money
// already used: changing the totals instead would retroactively restate
// figures a customer may have reconciled against their own general
// ledger. The alternative -- "overlaps the window" -- double-counts, so
// a year would not equal the sum of its months.
//
// The cost of the choice is real: a posting spanning a boundary appears
// in no report for that window. `countSpanningPostings` exists so that
// exclusion can be reported rather than being silent, and this file
// pins that it stays that way.

import fs from 'fs';
import path from 'path';
import { buildPeriodFilter } from '../../modules/finance/repositories/allocation-ledger.repository';

const ROOT = path.resolve(__dirname, '../..');
const REPO = 'modules/finance/repositories/allocation-ledger.repository.ts';
const src = fs.readFileSync(path.join(ROOT, REPO), 'utf8');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const code = stripComments(src);

const JAN = new Date('2026-01-01T00:00:00Z');
const JAN_END = new Date('2026-01-31T23:59:59.999Z');

describe('buildPeriodFilter: one rule, fully contained', () => {
  it('constrains BOTH ends of the period', () => {
    expect(buildPeriodFilter(JAN, JAN_END)).toEqual({
      periodStart: { $gte: JAN },
      periodEnd: { $lte: JAN_END },
    });
  });

  it('REGRESSION: does not constrain periodStart alone', () => {
    // The list endpoint's old shape. `{periodStart: {$gte, $lte}}` lets
    // a posting that ENDS after the window through, which is exactly the
    // row the header would not count.
    const filter = buildPeriodFilter(JAN, JAN_END);
    expect(filter.periodEnd).toBeDefined();
    expect(filter.periodStart).toEqual({ $gte: JAN });
  });

  it('applies only the bound it was given', () => {
    expect(buildPeriodFilter(JAN, undefined)).toEqual({ periodStart: { $gte: JAN } });
    expect(buildPeriodFilter(undefined, JAN_END)).toEqual({ periodEnd: { $lte: JAN_END } });
    expect(buildPeriodFilter(undefined, undefined)).toEqual({});
  });

  it('the filter it produces matches exactly the postings it should', () => {
    // Evaluated by hand rather than through Mongo, so the property is
    // asserted rather than assumed. The interesting row is the third.
    const postings = [
      { id: 'inside', periodStart: new Date('2026-01-10'), periodEnd: new Date('2026-01-10') },
      { id: 'spans-out', periodStart: new Date('2026-01-20'), periodEnd: new Date('2026-02-20') },
      { id: 'spans-in', periodStart: new Date('2025-12-20'), periodEnd: new Date('2026-01-05') },
      { id: 'outside', periodStart: new Date('2026-03-01'), periodEnd: new Date('2026-03-01') },
    ];

    const filter = buildPeriodFilter(JAN, JAN_END) as {
      periodStart: { $gte: Date };
      periodEnd: { $lte: Date };
    };
    const matched = postings
      .filter(
        (p) =>
          p.periodStart >= filter.periodStart.$gte && p.periodEnd <= filter.periodEnd.$lte
      )
      .map((p) => p.id);

    // 'spans-out' used to appear in the LIST but never in the TOTAL.
    // Now it appears in neither, and countSpanningPostings can say so.
    expect(matched).toEqual(['inside']);
  });
});

describe('the repository has exactly one period rule', () => {
  it('every period-filtered read goes through buildPeriodFilter', () => {
    // Three call sites: the list filter and the two totals aggregations.
    const uses = code.match(/buildPeriodFilter\(/g) ?? [];
    // One definition plus three uses.
    expect(uses.length).toBeGreaterThanOrEqual(4);
  });

  it('REGRESSION: no hand-written period clause remains', () => {
    // The exact pair that used to be inlined in both totals methods, and
    // the list's periodStart-only shape.
    expect(code).not.toMatch(/periodStart:\s*\{\s*\$gte:\s*periodStart\s*\},\s*\n\s*periodEnd:\s*\{\s*\$lte:\s*periodEnd\s*\}/);
    expect(code).not.toMatch(/filter\.periodStart = periodFilter/);
  });
});

describe('the exclusion is countable, not silent', () => {
  it('countSpanningPostings exists', () => {
    // A report that quietly drops a cost is the failure the
    // fully-contained rule is chosen to avoid on the other side. If the
    // rule excludes something, a caller must be able to say how much.
    expect(code).toMatch(/async countSpanningPostings\(/);
  });

  it('it is tenant- and org-unit-scoped like every other read here', () => {
    // Aggregates are where scope leaks come back, and that has happened
    // twice in this codebase.
    const method = code.slice(code.indexOf('async countSpanningPostings('));
    expect(method).toMatch(/tenantId: context\.organizationId/);
    expect(method).toMatch(/tenantScopeService\.buildFilter/);
    expect(method).toMatch(/isDeleted: \{ \$ne: true \}/);
  });

  it('it counts overlapping-but-not-contained, not merely overlapping', () => {
    const method = code.slice(code.indexOf('async countSpanningPostings('));
    expect(method).toMatch(/\$or: \[\{ periodStart: \{ \$lt: periodStart \} \}, \{ periodEnd: \{ \$gt: periodEnd \} \}\]/);
  });
});

describe('the ledger stays append-only', () => {
  it('update, softDelete and hardDelete still throw', () => {
    // Restated here because this file touches the repository: a period
    // refactor is exactly the kind of change that quietly re-enables an
    // inherited mutation method.
    for (const method of ['async update(', 'async softDelete(', 'async hardDelete(']) {
      const at = code.indexOf(method);
      expect({ method, present: at > -1 }).toEqual({ method, present: true });
      expect(code.slice(at, at + 300)).toMatch(/throw new ConflictError/);
    }
  });
});
