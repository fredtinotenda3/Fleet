// modules/telematics/services/telemetry-alert-rules.definitions.ts
//
// WAVE 2 -- the three Rule definitions that reproduce reading-alerts.ts's
// hardcoded conditions on the Rule Engine. A pure, side-effect-free
// module (no repository, no I/O) so both scripts/seed-telemetry-alert-
// rules.ts (which persists them for a tenant) and the parity test suite
// (tests/security/telemetry-rule-engine-parity.spec.ts, which evaluates
// them directly against the real condition engine, exactly as
// production will) import the SAME definitions -- a test that imported
// its own hand-copied version of these conditions could drift from what
// production actually seeds without either the test or the seed script
// noticing.
//
// See reading-alerts.ts for the alerts these reproduce, and
// telematics-actions.ts for why message/value construction is type-aware
// rather than a generic template.

import { RuleConditionGroup } from '../../rules/types/rule.types';
import { TELEMETRY_READING_INGESTED_TRIGGER } from './telemetry-rule-context';
import { SPEEDING_THRESHOLD_KMH, LOW_FUEL_THRESHOLD_PERCENT } from './reading-alerts';

export interface TelemetryAlertRuleDefinition {
  name: string;
  description: string;
  category: string;
  trigger: typeof TELEMETRY_READING_INGESTED_TRIGGER;
  conditions: RuleConditionGroup;
  actionParams: Record<string, unknown>;
  priority: number;
}

/**
 * One definition per reading-alerts.ts alert. `conditions` reproduces
 * the guard reading-alerts.ts evaluates in code; `actionParams` supplies
 * everything `create_telemetry_alert` needs beyond what it reads from
 * the evaluation context.
 *
 * No new condition-engine behaviour was needed for any of these three:
 * `gt`/`lt` (rule-engine.service.ts) already require
 * `typeof actual === 'number'` on both sides, which is the identical
 * absent-vs-zero distinction reading-alerts.ts's own `typeof === 'number'`
 * guards encode in code.
 */
export const TELEMETRY_ALERT_RULE_DEFINITIONS: readonly TelemetryAlertRuleDefinition[] = [
  {
    name: 'Telemetry: Speeding (migrated from reading-alerts.ts)',
    description:
      `Matches reading-alerts.ts's speeding alert: location.speed > ${SPEEDING_THRESHOLD_KMH} km/h. ` +
      'A reading with no location is not evaluated by this condition at all (a missing `location.speed` ' +
      'resolves to undefined, and `gt` requires a number on both sides).',
    category: 'telemetry',
    trigger: TELEMETRY_READING_INGESTED_TRIGGER,
    conditions: {
      type: 'AND',
      conditions: [{ field: 'location.speed', operator: 'gt', value: SPEEDING_THRESHOLD_KMH }],
    },
    actionParams: { type: 'speeding', severity: 'high', threshold: SPEEDING_THRESHOLD_KMH },
    priority: 10,
  },
  {
    name: 'Telemetry: Engine fault codes (migrated from reading-alerts.ts)',
    description:
      "Matches reading-alerts.ts's engine-DTC alert: engine.dtcCodes is a non-empty array. " +
      '`engine.dtcCodes.length gt 0` resolves to undefined (never matches) when dtcCodes is absent, ' +
      "matching reading-alerts.ts's `data.engine?.dtcCodes && data.engine.dtcCodes.length > 0` guard.",
    category: 'telemetry',
    trigger: TELEMETRY_READING_INGESTED_TRIGGER,
    conditions: {
      type: 'AND',
      conditions: [{ field: 'engine.dtcCodes.length', operator: 'gt', value: 0 }],
    },
    actionParams: { type: 'engine', severity: 'critical' },
    priority: 10,
  },
  {
    name: 'Telemetry: Low fuel level (migrated from reading-alerts.ts)',
    description:
      `Matches reading-alerts.ts's low-fuel alert: engine.fuelLevel < ${LOW_FUEL_THRESHOLD_PERCENT}%. ` +
      "A device that does not report fuel leaves `fuelLevel` absent, which `lt` (requiring a number on " +
      "both sides) never matches -- preserving the absent-vs-zero distinction reading-alerts.ts documents.",
    category: 'telemetry',
    trigger: TELEMETRY_READING_INGESTED_TRIGGER,
    conditions: {
      type: 'AND',
      conditions: [{ field: 'engine.fuelLevel', operator: 'lt', value: LOW_FUEL_THRESHOLD_PERCENT }],
    },
    actionParams: { type: 'maintenance', severity: 'high', threshold: LOW_FUEL_THRESHOLD_PERCENT },
    priority: 10,
  },
];
