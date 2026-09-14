// modules/telematics/services/telemetry-rule-engine.config.ts
//
// WAVE 2 -- when is the Rule Engine the authoritative telemetry alert
// path?
//
// ---------------------------------------------------------------------
// WHY THIS IS A CONFIG FILE AND NOT AN `if`
// ---------------------------------------------------------------------
// Mirrors attention-dispatch.config.ts's own reasoning: this decides
// which system is allowed to author vehicle alerts, and that is a
// product/operations decision that should be made explicitly, in one
// documented place, rather than as a condition buried in
// TelematicsService that the next reader has to reverse-engineer.
//
// ---------------------------------------------------------------------
// THE DUPLICATE ALERT INVARIANT
// ---------------------------------------------------------------------
// Exactly one of the legacy reading-alerts.ts path or the rule-engine
// path runs for a given reading -- never both, never neither (when the
// reading's own signals would otherwise warrant one).
// `TelematicsService.evaluateAlertsForReading` branches on this flag
// with a single if/else, not two independently-gated conditionals, so
// the mutual exclusion is visible in the control flow itself rather
// than something a reviewer has to prove by reading two call sites and
// checking they can never both be true.
//
// ---------------------------------------------------------------------
// THE DEFAULT: THE LEGACY PATH, UNCHANGED
// ---------------------------------------------------------------------
// `TELEMETRY_RULE_ENGINE_ENABLED=false` (the default, matching
// ATTENTION_AUTO_DISPATCH_ENABLED's own opt-in convention) means ZERO
// behavioural change from before Wave 2: reading-alerts.ts keeps
// deriving alerts exactly as it always has, for every tenant, until this
// is explicitly turned on.
//
// That is the safe default for the same reason attention auto-dispatch's
// is: a mis-migrated rule (a missing condition, a wrong threshold, an
// action that is only partially implemented) must not silently reduce
// or duplicate alerting on a live fleet on top of an already-verified
// path. Flipping this on is a deliberate action taken after the parity
// test suite has passed and the tenant's rules exist (see
// telemetry-alert-rules.seed.ts) -- not a default anyone falls into.
//
// ---------------------------------------------------------------------
// FAIL CLOSED ON A BAD VALUE
// ---------------------------------------------------------------------
// A malformed flag REFUSES rather than defaulting, matching
// attention-dispatch.config.ts and telemetry-retention.config.ts. This
// switch decides which system writes alert rows for a fleet; an
// unparseable value silently choosing either behaviour is worse than an
// explicit startup failure.

export class TelemetryRuleEngineConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelemetryRuleEngineConfigError';
  }
}

export interface TelemetryRuleEngineConfig {
  /** Whether the Rule Engine (rather than reading-alerts.ts) is the authoritative telemetry alert path. Default false. */
  enabled: boolean;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = raw.trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new TelemetryRuleEngineConfigError(
    `${name} must be "true" or "false" (case and surrounding whitespace are ignored). ` +
      `Received: ${JSON.stringify(raw)}. ` +
      'This switch decides which system authors vehicle alerts, ' +
      'so an ambiguous value is refused rather than interpreted.'
  );
}

export function resolveTelemetryRuleEngineConfig(): TelemetryRuleEngineConfig {
  return {
    // Opt-IN. The conservative default is the already-verified legacy
    // path, not the newly-wired one.
    enabled: readBool('TELEMETRY_RULE_ENGINE_ENABLED', false),
  };
}

let cached: TelemetryRuleEngineConfig | null = null;

export function getTelemetryRuleEngineConfig(): TelemetryRuleEngineConfig {
  if (!cached) cached = resolveTelemetryRuleEngineConfig();
  return cached;
}

/** TEST ONLY. */
export function resetTelemetryRuleEngineConfig(): void {
  cached = null;
}
