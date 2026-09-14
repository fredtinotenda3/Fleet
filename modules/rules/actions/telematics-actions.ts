// modules/rules/actions/telematics-actions.ts
//
// WAVE 2 -- `create_telemetry_alert`, the action a telemetry-driven rule
// uses to record and notify an alert exactly the way reading-alerts.ts's
// hardcoded path always has.
//
// ---------------------------------------------------------------------
// WHY THIS CALLS recordAndNotifyAlert RATHER THAN REIMPLEMENTING IT
// ---------------------------------------------------------------------
// See modules/telematics/services/telemetry-alert-writer.ts's header.
// The duplicate-alert invariant requires exactly one implementation of
// "what does it mean to record and notify an alert" -- this executor is
// a second CALLER of that implementation, never a second copy of it.
//
// ---------------------------------------------------------------------
// WHY MESSAGE/VALUE CONSTRUCTION IS TYPE-AWARE, NOT A GENERIC TEMPLATE
// ---------------------------------------------------------------------
// reading-alerts.ts's three alerts each interpolate a DIFFERENT signal
// into their message (a numeric speed, a joined list of DTC codes, a
// numeric fuel percentage) and each stores a different `value` (the
// speed itself; the CODE COUNT, not the joined string; the fuel
// percentage). A single generic "{value}" template would either lose
// that distinction or need its own per-type branching anyway -- so
// `buildTelemetryAlertContent` below branches explicitly on `type`,
// which is auditable (a reviewer can see exactly what each supported
// type produces) rather than a string-substitution layer that hides the
// same logic one level down.
//
// This is deliberately NOT built as a fully general "any future alert
// type" engine. Wave 2 instruction #17: "Do not expand scope merely
// because something could be improved." Only the three reading-alerts.ts
// conditions are migrated in this slice; a future wave adding a fourth
// telemetry alert family extends the switch below, visibly, rather than
// this executor silently guessing at a generic shape for a signal it has
// never seen.
//
// ---------------------------------------------------------------------
// "IMPLEMENTED OR EXPLICITLY UNSUPPORTED" (Wave 2 instruction #7)
// ---------------------------------------------------------------------
// `type` is validated against the full `TelematicsAlert['type']` union
// first (a rule author can select any of the eight documented types --
// rejecting an invalid one is a config error, not a capability gap), but
// `buildTelemetryAlertContent`'s switch only IMPLEMENTS the three
// reading-alerts.ts migrated so far. A rule configured with a type this
// executor does not yet render (hard_brake, hard_accel, idle, geofence,
// vendor) fails loudly with a message naming exactly which types are
// implemented -- `evaluateAndExecute` records `{success: false, error}`
// for it -- rather than writing an alert with a fabricated or empty
// message.
//
// ---------------------------------------------------------------------
// DATA TRUTH
// ---------------------------------------------------------------------
// Every signal this executor reads (location.speed, engine.dtcCodes,
// engine.fuelLevel) comes from the evaluation context the rule itself
// already matched against -- never a param, never a default, never a
// fabricated 0. If the expected signal is genuinely absent from the
// context (which should not happen: the rule's own condition already
// required it to be present and numeric/non-empty to match), this
// refuses rather than writing a fabricated value.

import { ruleActionRegistry, IRuleActionExecutor } from '../registry/RuleActionRegistry';
import { RuleAction, RuleEvaluationContext } from '../types/rule.types';
import { TelematicsAlert } from '@/modules/telematics/types/telematics.types';
import { recordAndNotifyAlert } from '@/modules/telematics/services/telemetry-alert-writer';

export class TelemetryRuleActionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelemetryRuleActionInputError';
  }
}

const VALID_ALERT_TYPES: ReadonlySet<TelematicsAlert['type']> = new Set([
  'speeding',
  'hard_brake',
  'hard_accel',
  'idle',
  'geofence',
  'engine',
  'maintenance',
  'vendor',
]);

const VALID_SEVERITIES: ReadonlySet<TelematicsAlert['severity']> = new Set([
  'low',
  'medium',
  'high',
  'critical',
]);

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

interface BuiltAlertContent {
  message: string;
  value?: number;
  threshold?: number;
}

/**
 * Renders the message/value/threshold for one supported alert type from
 * the reading that matched, mirroring reading-alerts.ts's own three
 * derivations verbatim. See the file header for why this is explicit
 * per-type logic rather than a generic template.
 */
function buildTelemetryAlertContent(
  type: TelematicsAlert['type'],
  context: RuleEvaluationContext,
  params: Record<string, unknown>
): BuiltAlertContent {
  const threshold = typeof params.threshold === 'number' ? params.threshold : undefined;

  switch (type) {
    case 'speeding': {
      const location = context.location as { speed?: unknown } | undefined;
      const speed = location?.speed;
      if (typeof speed !== 'number') {
        throw new TelemetryRuleActionInputError(
          'create_telemetry_alert(type="speeding") requires a numeric context.location.speed; ' +
            'refusing to fabricate a value for a reading that did not actually report one.'
        );
      }
      return { message: `Vehicle exceeding speed limit: ${speed} km/h`, value: speed, threshold };
    }

    case 'engine': {
      const engine = context.engine as { dtcCodes?: unknown } | undefined;
      const dtcCodes = engine?.dtcCodes;
      if (!Array.isArray(dtcCodes) || dtcCodes.length === 0) {
        throw new TelemetryRuleActionInputError(
          'create_telemetry_alert(type="engine") requires a non-empty context.engine.dtcCodes array; ' +
            'refusing to fabricate a value for a reading that did not actually report one.'
        );
      }
      return {
        message: `Engine fault codes detected: ${dtcCodes.join(', ')}`,
        // The COUNT, not the joined string -- matches
        // reading-alerts.ts's `value: data.engine.dtcCodes.length` exactly.
        value: dtcCodes.length,
      };
    }

    case 'maintenance': {
      const engine = context.engine as { fuelLevel?: unknown } | undefined;
      const fuelLevel = engine?.fuelLevel;
      if (typeof fuelLevel !== 'number') {
        throw new TelemetryRuleActionInputError(
          'create_telemetry_alert(type="maintenance") requires a numeric context.engine.fuelLevel; ' +
            'refusing to fabricate a value for a reading that did not actually report one.'
        );
      }
      return { message: `Low fuel level: ${fuelLevel}%`, value: fuelLevel, threshold };
    }

    default:
      // hard_brake / hard_accel / idle / geofence / vendor: valid
      // TelematicsAlert types, but this executor does not yet know how
      // to render them. See the file header ("IMPLEMENTED OR EXPLICITLY
      // UNSUPPORTED").
      throw new TelemetryRuleActionInputError(
        `create_telemetry_alert does not yet implement type "${type}". ` +
          'Implemented: speeding, engine, maintenance. Extend buildTelemetryAlertContent ' +
          'in modules/rules/actions/telematics-actions.ts before configuring a rule with this type.'
      );
  }
}

function resolveTimestamp(context: RuleEvaluationContext): Date {
  const raw = context.timestamp;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === 'string' && !Number.isNaN(Date.parse(raw))) return new Date(raw);
  // The reading's own timestamp should always be present and a real
  // Date -- TelematicsData.timestamp is required. Falling back to "now"
  // here is defensive only, matching the conservative fallback pattern
  // used elsewhere in this module (see maintenance-actions.ts's
  // scheduleMaintenance due-date handling) rather than throwing for a
  // condition that should be unreachable in practice.
  return new Date();
}

class CreateTelemetryAlertAction implements IRuleActionExecutor {
  async execute(action: RuleAction, context: RuleEvaluationContext, tenantId: string): Promise<void> {
    const params = (action.params ?? {}) as Record<string, unknown>;

    const vehicleId = str(context.vehicleId);
    if (!vehicleId) {
      throw new TelemetryRuleActionInputError(
        'create_telemetry_alert requires context.vehicleId; refusing to write an alert against an unidentified vehicle.'
      );
    }

    const type = str(params.type) as TelematicsAlert['type'] | undefined;
    if (!type || !VALID_ALERT_TYPES.has(type)) {
      throw new TelemetryRuleActionInputError(
        `create_telemetry_alert requires params.type to be one of ${[...VALID_ALERT_TYPES].join(', ')}; ` +
          `got ${JSON.stringify(params.type)}.`
      );
    }

    const severity = str(params.severity) as TelematicsAlert['severity'] | undefined;
    if (!severity || !VALID_SEVERITIES.has(severity)) {
      throw new TelemetryRuleActionInputError(
        `create_telemetry_alert requires params.severity to be one of ${[...VALID_SEVERITIES].join(', ')}; ` +
          `got ${JSON.stringify(params.severity)}.`
      );
    }

    const built = buildTelemetryAlertContent(type, context, params);

    const alert: TelematicsAlert = {
      type,
      severity,
      message: built.message,
      ...(built.value !== undefined ? { value: built.value } : {}),
      ...(built.threshold !== undefined ? { threshold: built.threshold } : {}),
      timestamp: resolveTimestamp(context),
    };

    const orgUnitId = str(context.orgUnitId);
    await recordAndNotifyAlert(vehicleId, alert, tenantId, orgUnitId);
  }
}

let registered = false;

/**
 * Registers `create_telemetry_alert`.
 *
 * Idempotent, and called from rule-engine.service.ts beside
 * registerDefaultRuleActions/registerMaintenanceRuleActions, so the
 * registry is complete the moment the rule engine module loads.
 */
export function registerTelematicsRuleActions(): void {
  if (registered) return;
  registered = true;

  ruleActionRegistry.register('create_telemetry_alert', new CreateTelemetryAlertAction());
}
