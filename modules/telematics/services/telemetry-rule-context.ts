// modules/telematics/services/telemetry-rule-context.ts
//
// WAVE 2 -- the CANONICAL shape a telemetry reading presents to the Rule
// Engine, and the one trigger name production code fires it under.
//
// ---------------------------------------------------------------------
// WHY A DEDICATED BUILDER RATHER THAN PASSING `data` DIRECTLY
// ---------------------------------------------------------------------
// `RuleEvaluationContext` is an open `{ [key: string]: unknown }` --
// nothing stops a caller from handing the engine the raw ingestion
// payload wholesale. This function exists so there is exactly ONE
// definition of what a rule author can rely on seeing when they write a
// condition like `{ field: "location.speed", operator: "gt", value: 120 }`
// against this trigger, independent of whatever internal fields
// TelematicsData happens to carry (tenantId, deviceId storage details,
// providerMetadata, etc.) that a rule has no business depending on.
//
// ---------------------------------------------------------------------
// DATA TRUTH
// ---------------------------------------------------------------------
// Every field below is passed through UNCHANGED from the reading that
// was actually persisted -- never defaulted, coerced, widened, or
// backfilled here. `engine` / `trip` / `fuel` keep whatever optional
// members were (or were not) reported. A condition that reads an absent
// field resolves to `undefined` in RuleEngineService.resolveField, and
// the engine's own numeric operators already require
// `typeof actual === 'number'` before comparing -- so "this device does
// not report fuel" and "the tank reads empty" remain distinguishable all
// the way through the Rule Engine, exactly as reading-alerts.ts's own
// `typeof === 'number'` guard requires. See that file's header for why
// this distinction is load-bearing.
//
// ---------------------------------------------------------------------
// EXTENDING THIS FOR FUTURE ALERT FAMILIES (Wave 2 instruction #16)
// ---------------------------------------------------------------------
// R.6/R.7/R.9/R.10/R.12/R.14/R.15 depend on canonical telemetry signals
// that do not exist on TelematicsData today (driving-behaviour events,
// RPM-derived signals, etc.) and MUST NOT be fabricated here. When a real
// adapter starts populating a new signal group, add it as its own
// optional field on this context (and on TelematicsData) rather than
// overloading an existing one -- so a rule referencing the new group
// simply sees `undefined` until a real adapter populates it, never a
// manufactured value.
//
// ---------------------------------------------------------------------
// ONE TRIGGER NAME, AND WHY IT IS NOT `TelematicsDataIngested`
// ---------------------------------------------------------------------
// `TelematicsDataIngested` (server/events/event-names.ts) is a DOMAIN
// EVENT name already wired to WorkflowTriggerHandler, WebSocketHandler
// and documented for webhook subscriptions -- but nothing in the
// codebase actually publishes it (confirmed by exhaustive search; see
// the Wave 2 report's architectural findings). It travels the
// outbox/event-bus, is fully decoupled from the caller, and activating
// it would simultaneously turn on three dormant integrations that are
// out of scope for this migration.
//
// The Rule Engine's invocation here is a SEPARATE, synchronous,
// direct-call mechanism (mirrors workflow-trigger.service.ts, reached
// via ruleTriggerService.fireEvent), not a subscriber on that bus. Using
// the same name as the dormant domain event would invite exactly the
// confusion this note exists to prevent -- a future engineer wiring up
// `TelematicsDataIngested` publication would have no way to know a rule
// trigger of the same name already exists on a completely different
// delivery mechanism, and could accidentally double-fire every telemetry
// rule the day that gap is closed. `telemetry.reading_ingested` is
// therefore a deliberately distinct name, scoped to this one call site.

import { RuleEvaluationContext } from '@/modules/rules/types/rule.types';
import { TelematicsData } from '../types/telematics.types';

/** The trigger name every rule that reacts to a telemetry reading must use. */
export const TELEMETRY_READING_INGESTED_TRIGGER = 'telemetry.reading_ingested';

/** The fields of a persisted reading the Rule Engine is allowed to see. */
export type TelemetryRuleSourceData = Pick<
  TelematicsData,
  'vehicleId' | 'deviceId' | 'location' | 'engine' | 'trip' | 'fuel' | 'timestamp'
> & { orgUnitId?: string };

/**
 * Builds the RuleEvaluationContext for one ingested reading.
 *
 * `orgUnitId` is included for the action layer (notification scoping,
 * websocket fan-out) and for a rule author who wants to key a condition
 * on it directly -- it is NOT currently used to restrict WHICH rules are
 * eligible to evaluate a reading (see the Wave 2 report's discussion of
 * `Rule` having no `orgUnitId` field: this inherits, unchanged, the same
 * characteristic reading-alerts.ts's hardcoded path already has -- a
 * tenant-wide condition applies to every vehicle in the tenant regardless
 * of branch, both before and after this migration).
 */
export function buildTelemetryRuleContext(data: TelemetryRuleSourceData): RuleEvaluationContext {
  return {
    vehicleId: data.vehicleId,
    deviceId: data.deviceId,
    orgUnitId: data.orgUnitId,
    location: data.location,
    engine: data.engine,
    trip: data.trip,
    fuel: data.fuel,
    timestamp: data.timestamp,
  };
}
