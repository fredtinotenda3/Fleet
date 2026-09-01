// modules/attention/services/attention-dispatch.config.ts
//
// BACKLOG ITEM 6 -- when may the platform create work on its own?
//
// ---------------------------------------------------------------------
// WHY THIS IS A CONFIG FILE AND NOT AN `if`
// ---------------------------------------------------------------------
// P6-N3 recorded that choosing the trigger point "is a product decision
// about when the platform should start creating work on its own, and it
// should be made explicitly rather than defaulted to by whoever wires
// the repository". That is right, and it is why the answer lives here,
// in one file, with the reasoning attached -- rather than as a
// condition buried in a handler where the next reader would have to
// reverse-engineer the policy from the code.
//
// ---------------------------------------------------------------------
// THE DEFAULT: OPERATOR-INITIATED ONLY
// ---------------------------------------------------------------------
// With no configuration at all, the platform dispatches an action ONLY
// when an operator explicitly asks it to (the dispatch endpoint). It
// never creates work from a refresh cycle.
//
// That is the safe default because attention items are RE-COMPUTED on a
// schedule from models whose inputs change. A scoring bug, a provider
// outage that makes every vehicle look stale, or a threshold typo would
// otherwise become a queue of real work orders against real vehicles,
// discovered by the workshop rather than by a test. The platform's own
// value ledger encodes the same principle: modelled versus REALISED,
// confirmed by a person.
//
// ---------------------------------------------------------------------
// THE OPT-IN: HIGH SEVERITY, AND ONLY WITH THE FLAG SET
// ---------------------------------------------------------------------
// `ATTENTION_AUTO_DISPATCH_ENABLED=true` allows automatic dispatch, and
// even then ONLY for items at or above `AUTO_DISPATCH_MIN_SEVERITY`
// ('high'). Both conditions, not either: a deployment that turns the
// flag on has still not asked for a work order per medium-severity
// finding.
//
// Severity is deliberately the only automatic criterion. Adding "and
// confidence > x" would sound safer and be worse -- confidence is
// produced by the same scorers whose failure mode this gate exists to
// contain, so it is not independent evidence.
//
// ---------------------------------------------------------------------
// FAIL CLOSED ON A BAD VALUE
// ---------------------------------------------------------------------
// A malformed flag REFUSES rather than defaulting, matching
// telemetry-retention.config.ts. `ATTENTION_AUTO_DISPATCH_ENABLED=yes`
// silently meaning "off" would be a deployment that believes automation
// is running and finds out otherwise; `=Trues` silently meaning "on"
// would be worse. Neither is acceptable for a switch that decides
// whether software creates work by itself.

import type { AISeverity } from '@/modules/ai/types/ai.types';

export class AttentionDispatchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttentionDispatchConfigError';
  }
}

/** Ranked least-severe first, so a numeric index can compare two. */
const SEVERITY_ORDER: readonly AISeverity[] = ['low', 'medium', 'high', 'critical'];

/** Automatic dispatch never fires below this, even with the flag on. */
export const AUTO_DISPATCH_MIN_SEVERITY: AISeverity = 'high';

export interface AttentionDispatchConfig {
  /** Whether severity-triggered automatic dispatch is permitted at all. Default false. */
  autoDispatchEnabled: boolean;
  minAutoSeverity: AISeverity;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = raw.trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new AttentionDispatchConfigError(
    `${name} must be "true" or "false" (case and surrounding whitespace are ignored). ` +
      `Received: ${JSON.stringify(raw)}. ` +
      'This switch decides whether the platform creates work orders without a human, ' +
      'so an ambiguous value is refused rather than interpreted.'
  );
}

export function resolveAttentionDispatchConfig(): AttentionDispatchConfig {
  return {
    // Opt-IN. The default must be the conservative one, and "software
    // raises work orders by itself" is not the conservative one.
    autoDispatchEnabled: readBool('ATTENTION_AUTO_DISPATCH_ENABLED', false),
    minAutoSeverity: AUTO_DISPATCH_MIN_SEVERITY,
  };
}

let cached: AttentionDispatchConfig | null = null;

export function getAttentionDispatchConfig(): AttentionDispatchConfig {
  if (!cached) cached = resolveAttentionDispatchConfig();
  return cached;
}

/** TEST ONLY. */
export function resetAttentionDispatchConfig(): void {
  cached = null;
}

/** True when `severity` is at least `minimum`. */
export function severityAtLeast(severity: AISeverity, minimum: AISeverity): boolean {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(minimum);
}
