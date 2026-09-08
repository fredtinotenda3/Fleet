// tests/helpers/perf-calibration.ts
//
// Machine-relative budgets for the performance smoke tests.
//
// ---------------------------------------------------------------------
// WHY ABSOLUTE MILLISECOND BUDGETS DO NOT WORK HERE
// ---------------------------------------------------------------------
// hot-path-budgets.spec.ts asserted fixed wall-clock ceilings. The
// backup-writer case measured 73 ms on the CI sandbox and 8,568 ms on a
// developer's Windows laptop against a 5,000 ms budget -- a 117x spread
// for identical code.
//
// That spread is not CPU speed. It is `for await` overhead: 50,000
// async iterations are 50,000 microtask ticks, and a throttled VM, an
// on-access antivirus scanner or an attached debugger multiplies the
// per-tick cost in a way a straight-line CPU loop never shows. A budget
// tuned for one machine is either flaky on the slow one or meaningless
// on the fast one.
//
// A flaky performance test is worse than no performance test: it trains
// the team to re-run the pipeline, which is the exact habit that lets a
// real regression through. That reasoning is already in the spec's own
// header -- the absolute budgets simply did not live up to it.
//
// ---------------------------------------------------------------------
// WHAT THIS DOES INSTEAD
// ---------------------------------------------------------------------
// Measures the SAME KIND of work the assertion is about, on the machine
// actually running the test, and expresses the budget as a multiple of
// that.
//
// A regression this suite exists to catch -- an accidental O(n^2), a
// synchronous parse in a per-ping loop, a backtracking regex, an array
// where a generator belonged -- changes the SHAPE of the cost. It shows
// up as 50x the reference, on every machine. Machine speed shifts the
// reference and the measurement together and cancels out.
//
// Calibration is measured once per process and memoised: it is a
// property of the machine, not of the test.

/** Iterations used for both calibration loops. Small enough to be free. */
const CALIBRATION_N = 20_000;

interface MachineReference {
  /** ms for CALIBRATION_N iterations of a trivial synchronous CPU loop. */
  syncMs: number;
  /** ms for CALIBRATION_N iterations of `for await` over an async generator. */
  asyncIterMs: number;
}

let cached: MachineReference | null = null;

async function measureMachine(): Promise<MachineReference> {
  // --- synchronous reference: plain arithmetic + string building ---
  const syncStart = performance.now();
  let sink = 0;
  for (let i = 0; i < CALIBRATION_N; i += 1) {
    sink += JSON.stringify({ i, s: 'x' }).length;
  }
  const syncMs = performance.now() - syncStart;

  // --- async-iteration reference: the cost that actually varies ---
  async function* source(): AsyncGenerator<number> {
    for (let i = 0; i < CALIBRATION_N; i += 1) yield i;
  }
  const asyncStart = performance.now();
  let count = 0;
  for await (const value of source()) count += value === -1 ? 1 : 0;
  const asyncIterMs = performance.now() - asyncStart;

  // Referenced so a smart optimiser cannot elide either loop entirely.
  if (sink < 0 || count < 0) throw new Error('unreachable');

  return { syncMs, asyncIterMs };
}

/** Memoised machine reference. Safe to call from every test. */
export async function machineReference(): Promise<MachineReference> {
  if (!cached) cached = await measureMachine();
  return cached;
}

/**
 * A budget for work dominated by ASYNC ITERATION, expressed as a
 * multiple of this machine's own async-iteration cost.
 *
 * @param iterations how many async iterations the measured work performs
 * @param tolerance  how many times the reference per-iteration cost the
 *                   work may take. Generous by design -- this catches
 *                   structural regressions, not slow days.
 *
 * A floor is applied so that on a very fast machine the budget never
 * collapses to single-digit milliseconds, where scheduler noise alone
 * would fail it.
 */
export async function asyncIterationBudget(
  iterations: number,
  tolerance: number
): Promise<number> {
  const { asyncIterMs } = await machineReference();
  const perIteration = asyncIterMs / CALIBRATION_N;
  return Math.max(250, perIteration * iterations * tolerance);
}

/**
 * A budget for work dominated by SYNCHRONOUS CPU, expressed the same
 * way. `units` is whatever the measured loop counts -- iterations,
 * records, comparisons -- and `tolerance` is relative to one unit
 * costing about as much as one calibration iteration.
 */
export async function syncBudget(units: number, tolerance: number): Promise<number> {
  const { syncMs } = await machineReference();
  const perUnit = syncMs / CALIBRATION_N;
  return Math.max(250, perUnit * units * tolerance);
}

/**
 * Formats a budget failure so the reader can tell a real regression from
 * a slow machine without re-running anything.
 */
export async function budgetContext(label: string, elapsed: number, budget: number): Promise<string> {
  const { syncMs, asyncIterMs } = await machineReference();
  return (
    `${label}: took ${elapsed.toFixed(1)}ms against a ${budget.toFixed(1)}ms budget. ` +
    `Machine reference for ${CALIBRATION_N} iterations: sync ${syncMs.toFixed(1)}ms, ` +
    `async-iter ${asyncIterMs.toFixed(1)}ms. A budget derived from this machine's own ` +
    `speed failing means the SHAPE of the work changed, not that the machine is slow.`
  );
}
