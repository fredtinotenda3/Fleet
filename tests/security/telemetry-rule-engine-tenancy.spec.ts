// tests/security/telemetry-rule-engine-tenancy.spec.ts
//
// WAVE 2, instruction #9 -- tenancy and security adversarial tests for
// the telemetry rule-engine invocation path.
//
// `ruleEngineService.fireTrigger(trigger, context, tenantId)` calls
// `ruleRepository.getActiveRulesForTrigger(trigger, tenantId)` --
// tenant-scoped by construction, the same repository method every other
// rule trigger in this codebase already relies on. These tests pin that
// the TELEMETRY invocation specifically inherits that isolation
// correctly (a wrong tenantId threaded through the new call sites would
// defeat it even though the repository method itself is already
// covered elsewhere), plus the two adversarial scenarios instruction #9
// names explicitly for this migration: a rule that exists in one tenant
// must never evaluate another tenant's telemetry, and an unresolvable/
// missing vehicle identity must fail closed rather than writing an
// alert against nothing.
//
// KNOWN, DOCUMENTED, CARRIED-FORWARD CHARACTERISTIC (not a new gap):
// `Rule` has no `orgUnitId` field (rule.types.ts), so a tenant-wide rule
// matches every vehicle in the tenant regardless of branch/org-unit --
// exactly the same as reading-alerts.ts's own hardcoded path, which has
// no org-unit-scoping concept at the "which conditions apply" level
// either (only WHO gets notified and where the alert is filed is
// org-unit-aware, via resolveAlertOwnership, unchanged by this
// migration). This suite documents that inherited characteristic
// explicitly rather than silently asserting around it -- see the Wave 2
// report's Final Engineering Question on branch-scoping for the same
// point made in prose.

jest.mock('@/infrastructure/monitoring/audit.logger', () => ({
  auditLog: { log: jest.fn() },
}));
jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(), logDebug: jest.fn() },
}));
jest.mock('@/modules/telematics/services/telemetry-alert-writer', () => ({
  recordAndNotifyAlert: jest.fn(),
}));

const mockRuleRepository = { getActiveRulesForTrigger: jest.fn(), getRule: jest.fn() };
jest.mock('@/modules/rules/repositories/rule.repository', () => ({
  ruleRepository: mockRuleRepository,
}));

import { ruleEngineService } from '@/modules/rules/services/rule-engine.service';
import { recordAndNotifyAlert } from '@/modules/telematics/services/telemetry-alert-writer';
import { buildTelemetryRuleContext, TELEMETRY_READING_INGESTED_TRIGGER } from '@/modules/telematics/services/telemetry-rule-context';
import { TELEMETRY_ALERT_RULE_DEFINITIONS } from '@/modules/telematics/services/telemetry-alert-rules.definitions';
import type { Rule } from '@/modules/rules/types/rule.types';

const recordAndNotifyAlertMock = recordAndNotifyAlert as jest.Mock;

const TENANT_A = 'willsgrove-farm-enterprises-9e80ed';
const TENANT_B = 'toyota-zimbabwe-63078f';

function speedingRule(tenantId: string): Rule {
  const def = TELEMETRY_ALERT_RULE_DEFINITIONS.find((d) => d.name.includes('Speeding'))!;
  return {
    _id: `rule-${tenantId}`,
    tenantId,
    name: def.name,
    category: def.category,
    trigger: def.trigger,
    conditions: def.conditions,
    actions: [{ type: 'create_telemetry_alert', params: def.actionParams }],
    priority: def.priority,
    status: 'active',
    version: 1,
  } as Rule;
}

beforeEach(() => {
  jest.clearAllMocks();
  recordAndNotifyAlertMock.mockResolvedValue(undefined);
});

describe('Tenant A rule + Tenant B telemetry: fail closed by construction', () => {
  it('firing TENANT_B\'s telemetry only ever asks the repository for TENANT_B\'s rules', async () => {
    // Simulates the real repository's tenant-scoped find: only a query
    // for TENANT_B returns TENANT_B's rule; a query for TENANT_A (which
    // this test never issues) would return TENANT_A's.
    mockRuleRepository.getActiveRulesForTrigger.mockImplementation(async (_trigger: string, tenantId: string) =>
      tenantId === TENANT_B ? [speedingRule(TENANT_B)] : []
    );

    const context = buildTelemetryRuleContext({
      vehicleId: 'v-1',
      deviceId: 'dev-1',
      location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() },
      engine: {},
      trip: {},
      fuel: {},
      timestamp: new Date(),
    });

    await ruleEngineService.fireTrigger(TELEMETRY_READING_INGESTED_TRIGGER, context, TENANT_B);

    expect(mockRuleRepository.getActiveRulesForTrigger).toHaveBeenCalledWith(
      TELEMETRY_READING_INGESTED_TRIGGER,
      TENANT_B
    );
    expect(mockRuleRepository.getActiveRulesForTrigger).not.toHaveBeenCalledWith(
      TELEMETRY_READING_INGESTED_TRIGGER,
      TENANT_A
    );
    expect(recordAndNotifyAlertMock).toHaveBeenCalledTimes(1);
  });

  it('an empty rule set for the firing tenant produces zero alerts, even though another tenant has a matching rule', async () => {
    // TENANT_A has no telemetry rules configured yet; TENANT_B does.
    // Firing for TENANT_A must never pick up TENANT_B's rule.
    mockRuleRepository.getActiveRulesForTrigger.mockImplementation(async (_trigger: string, tenantId: string) =>
      tenantId === TENANT_B ? [speedingRule(TENANT_B)] : []
    );

    const context = buildTelemetryRuleContext({
      vehicleId: 'v-in-tenant-a',
      deviceId: 'dev-1',
      location: { lat: 0, lng: 0, speed: 999, timestamp: new Date() },
      engine: {},
      trip: {},
      fuel: {},
      timestamp: new Date(),
    });

    const results = await ruleEngineService.fireTrigger(TELEMETRY_READING_INGESTED_TRIGGER, context, TENANT_A);

    expect(results).toHaveLength(0);
    expect(recordAndNotifyAlertMock).not.toHaveBeenCalled();
  });
});

describe('unresolvable vehicle identity: fail closed rather than writing against nothing', () => {
  it('a context with no vehicleId is refused by the action, not silently written with an empty id', async () => {
    mockRuleRepository.getActiveRulesForTrigger.mockResolvedValue([speedingRule(TENANT_A)]);

    // Malformed/unresolvable canonical event -- e.g. a future caller
    // that forgets to stamp vehicleId. buildTelemetryRuleContext always
    // sets it from a real TelematicsData, so this simulates a
    // programming error at a hypothetical future call site, not a
    // reachable state today.
    const malformedContext = buildTelemetryRuleContext({
      vehicleId: '',
      deviceId: 'dev-1',
      location: { lat: 0, lng: 0, speed: 999, timestamp: new Date() },
      engine: {},
      trip: {},
      fuel: {},
      timestamp: new Date(),
    });

    const [result] = await ruleEngineService.fireTrigger(
      TELEMETRY_READING_INGESTED_TRIGGER,
      malformedContext,
      TENANT_A
    );

    expect(result.matched).toBe(true); // the condition itself still matches speed
    expect(result.actionsExecuted[0]).toMatchObject({ success: false });
    expect(result.actionsExecuted[0].error).toMatch(/requires context.vehicleId/);
    expect(recordAndNotifyAlertMock).not.toHaveBeenCalled();
  });
});

describe('malformed rule: an unimplemented action type fails that action only, not the whole trigger', () => {
  it('one rule with a bad action does not block a second rule from firing for the same trigger', async () => {
    const brokenRule: Rule = {
      ...speedingRule(TENANT_A),
      _id: 'rule-broken',
      actions: [{ type: 'create_telemetry_alert', params: { type: 'hard_brake', severity: 'high' } }],
    };
    const goodRule = speedingRule(TENANT_A);
    mockRuleRepository.getActiveRulesForTrigger.mockResolvedValue([brokenRule, goodRule]);

    const context = buildTelemetryRuleContext({
      vehicleId: 'v-1',
      deviceId: 'dev-1',
      location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() },
      engine: {},
      trip: {},
      fuel: {},
      timestamp: new Date(),
    });

    const results = await ruleEngineService.fireTrigger(TELEMETRY_READING_INGESTED_TRIGGER, context, TENANT_A);

    expect(results).toHaveLength(2);
    expect(results[0].actionsExecuted[0].success).toBe(false); // hard_brake: not yet implemented
    expect(results[1].actionsExecuted[0].success).toBe(true); // the working speeding rule still ran
    expect(recordAndNotifyAlertMock).toHaveBeenCalledTimes(1);
  });
});

describe('documented characteristic: a tenant-wide rule applies regardless of org unit (inherited from reading-alerts.ts, not new)', () => {
  it('the same rule matches telemetry from vehicles in two different org units', async () => {
    mockRuleRepository.getActiveRulesForTrigger.mockResolvedValue([speedingRule(TENANT_A)]);

    const harareVehicle = buildTelemetryRuleContext({
      vehicleId: 'v-harare',
      orgUnitId: 'unit-harare',
      deviceId: 'dev-1',
      location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() },
      engine: {},
      trip: {},
      fuel: {},
      timestamp: new Date(),
    });
    const bulawayoVehicle = buildTelemetryRuleContext({
      vehicleId: 'v-bulawayo',
      orgUnitId: 'unit-bulawayo',
      deviceId: 'dev-2',
      location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() },
      engine: {},
      trip: {},
      fuel: {},
      timestamp: new Date(),
    });

    await ruleEngineService.fireTrigger(TELEMETRY_READING_INGESTED_TRIGGER, harareVehicle, TENANT_A);
    await ruleEngineService.fireTrigger(TELEMETRY_READING_INGESTED_TRIGGER, bulawayoVehicle, TENANT_A);

    // Both fire -- this is the EXISTING characteristic reading-alerts.ts
    // already has, preserved for parity, not a defect introduced here.
    expect(recordAndNotifyAlertMock).toHaveBeenCalledTimes(2);
    expect(recordAndNotifyAlertMock.mock.calls.map((c) => c[0])).toEqual(['v-harare', 'v-bulawayo']);
    // Ownership/notification scoping (WHO is notified, WHERE the alert
    // is filed) still happens downstream in recordAndNotifyAlert via
    // resolveAlertOwnership, unaffected by this -- covered by
    // telemetry-alert-writer.spec.ts and telematics-alert-org-unit.spec.ts.
  });
});
