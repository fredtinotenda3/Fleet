// tests/security/telemetry-rule-engine-parity.spec.ts
//
// WAVE 2, instruction #5 -- PARITY BEFORE REMOVAL.
//
// This suite proves that TELEMETRY_ALERT_RULE_DEFINITIONS (the three
// rules scripts/seed-telemetry-alert-rules.ts creates), evaluated by the
// REAL RuleEngineService.evaluate against the REAL condition engine,
// makes the identical match/no-match decision reading-alerts.ts's
// deriveReadingAlerts makes -- reading by reading, for the scenarios
// instruction #5 requires: below/at/above threshold, missing/absent
// signal, an invalid (non-numeric) signal, and the genuine 0-vs-absent
// distinction that is the single most safety-critical property of this
// migration.
//
// Nothing here is mocked except the rule repository (so `fireTrigger`
// evaluates exactly these three rules rather than hitting Mongo) and the
// I/O side of `create_telemetry_alert` (persistence/notification, which
// telemetry-alert-writer.spec.ts and telematics-actions.spec.ts already
// cover on their own). The condition engine, the action registry, and
// the dotted-path field resolution are all real production code.

jest.mock('@/infrastructure/monitoring/audit.logger', () => ({
  auditLog: { log: jest.fn() },
}));
jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(), logDebug: jest.fn() },
}));
jest.mock('@/modules/telematics/services/telemetry-alert-writer', () => ({
  recordAndNotifyAlert: jest.fn(),
}));

const mockRuleRepository = {
  getActiveRulesForTrigger: jest.fn(),
  getRule: jest.fn(),
};
jest.mock('@/modules/rules/repositories/rule.repository', () => ({
  ruleRepository: mockRuleRepository,
}));

import { ruleEngineService } from '@/modules/rules/services/rule-engine.service';
import { recordAndNotifyAlert } from '@/modules/telematics/services/telemetry-alert-writer';
import { TELEMETRY_ALERT_RULE_DEFINITIONS } from '@/modules/telematics/services/telemetry-alert-rules.definitions';
import { buildTelemetryRuleContext, TELEMETRY_READING_INGESTED_TRIGGER, TelemetryRuleSourceData } from '@/modules/telematics/services/telemetry-rule-context';
import { deriveReadingAlerts } from '@/modules/telematics/services/reading-alerts';
import type { Rule } from '@/modules/rules/types/rule.types';

const recordAndNotifyAlertMock = recordAndNotifyAlert as jest.Mock;
const TENANT = 'willsgrove-farm-enterprises-9e80ed';

/** Turns a seed definition into a real, active Rule document (in memory only -- no DB). */
function asActiveRule(def: (typeof TELEMETRY_ALERT_RULE_DEFINITIONS)[number], index: number): Rule {
  return {
    _id: `seed-rule-${index}`,
    tenantId: TENANT,
    name: def.name,
    category: def.category,
    trigger: def.trigger,
    conditions: def.conditions,
    actions: [{ type: 'create_telemetry_alert', params: def.actionParams }],
    priority: def.priority,
    status: 'active',
    version: 1,
    stopOnMatch: false,
  } as Rule;
}

const ACTIVE_RULES = TELEMETRY_ALERT_RULE_DEFINITIONS.map(asActiveRule);

function reading(overrides: Partial<TelemetryRuleSourceData> = {}): TelemetryRuleSourceData {
  return {
    vehicleId: 'v-1',
    deviceId: 'dev-1',
    engine: {},
    trip: {},
    fuel: {},
    timestamp: new Date('2026-08-01T10:00:00Z'),
    ...overrides,
  };
}

async function fire(data: TelemetryRuleSourceData) {
  return ruleEngineService.fireTrigger(TELEMETRY_READING_INGESTED_TRIGGER, buildTelemetryRuleContext(data), TENANT);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRuleRepository.getActiveRulesForTrigger.mockResolvedValue(ACTIVE_RULES);
  recordAndNotifyAlertMock.mockResolvedValue(undefined);
});

/**
 * Table-driven parity check: for each reading, deriveReadingAlerts
 * (the OLD path) and the rule engine (the NEW path) must agree on
 * whether an alert of the given family fires.
 */
const SPEEDING_CASES: Array<{ label: string; speed: number | undefined; expectMatch: boolean }> = [
  { label: 'above threshold', speed: 140, expectMatch: true },
  { label: 'at threshold (boundary, exclusive)', speed: 120, expectMatch: false },
  { label: 'just above threshold', speed: 121, expectMatch: true },
  { label: 'well below threshold', speed: 60, expectMatch: false },
  { label: 'zero (a genuinely stationary vehicle)', speed: 0, expectMatch: false },
];

describe('parity: speeding', () => {
  it.each(SPEEDING_CASES)('$label (speed=$speed) matches old and new identically', async ({ speed, expectMatch }) => {
    const data = reading({ location: speed === undefined ? undefined : { lat: 0, lng: 0, speed, timestamp: new Date() } });

    const oldAlerts = deriveReadingAlerts(data as never);
    await fire(data);

    expect(oldAlerts.some((a) => a.type === 'speeding')).toBe(expectMatch);
    expect(recordAndNotifyAlertMock.mock.calls.length > 0).toBe(expectMatch);
  });

  it('a reading with NO location at all does not match (missing signal, not zero)', async () => {
    const data = reading({ location: undefined });
    const oldAlerts = deriveReadingAlerts(data as never);
    await fire(data);

    expect(oldAlerts).toHaveLength(0);
    expect(recordAndNotifyAlertMock).not.toHaveBeenCalled();
  });

  it('an invalid (non-numeric) speed never matches -- data truth, not coercion', async () => {
    const data = reading({ location: { lat: 0, lng: 0, speed: 'fast' as unknown as number, timestamp: new Date() } });
    await fire(data);
    expect(recordAndNotifyAlertMock).not.toHaveBeenCalled();
  });
});

const FUEL_CASES: Array<{ label: string; fuelLevel: number | undefined; expectMatch: boolean }> = [
  { label: 'well below threshold', fuelLevel: 3, expectMatch: true },
  { label: 'just below threshold', fuelLevel: 9, expectMatch: true },
  { label: 'at threshold (boundary, exclusive)', fuelLevel: 10, expectMatch: false },
  { label: 'above threshold', fuelLevel: 55, expectMatch: false },
  { label: 'a genuinely reported EMPTY tank (0%)', fuelLevel: 0, expectMatch: true },
];

describe('parity: low fuel -- the absent-vs-zero distinction is load-bearing', () => {
  it.each(FUEL_CASES)('$label (fuelLevel=$fuelLevel) matches old and new identically', async ({ fuelLevel, expectMatch }) => {
    const data = reading({ engine: { fuelLevel } });

    const oldAlerts = deriveReadingAlerts(data as never);
    await fire(data);

    expect(oldAlerts.some((a) => a.type === 'maintenance')).toBe(expectMatch);
    expect(recordAndNotifyAlertMock.mock.calls.some((c) => c[1].type === 'maintenance')).toBe(expectMatch);
  });

  it('a device that does not report fuel at all never alerts -- absence is not zero', async () => {
    const data = reading({ engine: {} }); // no fuelLevel key at all
    const oldAlerts = deriveReadingAlerts(data as never);
    await fire(data);

    expect(oldAlerts.some((a) => a.type === 'maintenance')).toBe(false);
    expect(recordAndNotifyAlertMock.mock.calls.some((c) => c[1]?.type === 'maintenance')).toBe(false);
  });
});

describe('parity: engine fault codes', () => {
  it('a non-empty dtcCodes array matches on both paths', async () => {
    const data = reading({ engine: { dtcCodes: ['P0301'] } });
    const oldAlerts = deriveReadingAlerts(data as never);
    await fire(data);

    expect(oldAlerts.some((a) => a.type === 'engine')).toBe(true);
    expect(recordAndNotifyAlertMock.mock.calls.some((c) => c[1].type === 'engine')).toBe(true);
  });

  it('an empty dtcCodes array does not match on either path', async () => {
    const data = reading({ engine: { dtcCodes: [] } });
    const oldAlerts = deriveReadingAlerts(data as never);
    await fire(data);

    expect(oldAlerts.some((a) => a.type === 'engine')).toBe(false);
    expect(recordAndNotifyAlertMock.mock.calls.some((c) => c[1]?.type === 'engine')).toBe(false);
  });

  it('no dtcCodes field at all does not match on either path', async () => {
    const data = reading({ engine: {} });
    const oldAlerts = deriveReadingAlerts(data as never);
    await fire(data);

    expect(oldAlerts.some((a) => a.type === 'engine')).toBe(false);
    expect(recordAndNotifyAlertMock.mock.calls.some((c) => c[1]?.type === 'engine')).toBe(false);
  });
});

describe('a reading that trips multiple conditions fires multiple rules (matching reading-alerts.ts producing multiple alerts)', () => {
  it('speeding AND low fuel in the same reading both fire', async () => {
    const data = reading({
      location: { lat: 0, lng: 0, speed: 150, timestamp: new Date() },
      engine: { fuelLevel: 2 },
    });

    const oldAlerts = deriveReadingAlerts(data as never);
    await fire(data);

    expect(oldAlerts.map((a) => a.type).sort()).toEqual(['maintenance', 'speeding']);
    const firedTypes = recordAndNotifyAlertMock.mock.calls.map((c) => c[1].type).sort();
    expect(firedTypes).toEqual(['maintenance', 'speeding']);
  });
});

describe('multi-vehicle isolation: each reading only ever alerts its own vehicle', () => {
  it('two vehicles speeding in the same batch never cross-contaminate the recorded vehicleId', async () => {
    await fire(reading({ vehicleId: 'v-a', location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() } }));
    await fire(reading({ vehicleId: 'v-b', location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() } }));

    const vehicleIds = recordAndNotifyAlertMock.mock.calls.map((c) => c[0]);
    expect(vehicleIds).toEqual(['v-a', 'v-b']);
  });
});

describe('repeated identical telemetry: the rule engine itself has no dedup/cooldown', () => {
  it('firing the same reading twice fires the rule twice -- matching reading-alerts.ts, which also has none', async () => {
    const data = reading({ location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() } });

    await fire(data);
    await fire(data);

    // NOT a regression: reading-alerts.ts's own header states plainly
    // there is no dedup/cooldown in this pipeline today ("every matching
    // reading produces a fresh alert on every poll"). The Rule Engine
    // must not silently FIX that as part of this migration -- parity
    // means reproducing the existing behaviour, including its known
    // limitations, not improving on it unasked. See the Wave 2 report's
    // "remaining gaps" for the natural, upstream idempotency this still
    // inherits (the telemetry write's own unique index).
    expect(recordAndNotifyAlertMock).toHaveBeenCalledTimes(2);
    expect(deriveReadingAlerts(data as never)).toHaveLength(1); // old path: same, no dedup
  });
});
