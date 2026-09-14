// tests/unit/telematics/telemetry-rule-engine.config.spec.ts
//
// WAVE 2 -- the flag that decides whether the Rule Engine or
// reading-alerts.ts is the authoritative telemetry alert path. Mirrors
// tests/security/attention-dispatch-wiring.spec.ts's own config
// assertions for ATTENTION_AUTO_DISPATCH_ENABLED, since this flag is
// deliberately built to the same contract.

import {
  getTelemetryRuleEngineConfig,
  resetTelemetryRuleEngineConfig,
  resolveTelemetryRuleEngineConfig,
  TelemetryRuleEngineConfigError,
} from '@/modules/telematics/services/telemetry-rule-engine.config';

beforeEach(() => {
  delete process.env.TELEMETRY_RULE_ENGINE_ENABLED;
  resetTelemetryRuleEngineConfig();
});

afterEach(() => {
  delete process.env.TELEMETRY_RULE_ENGINE_ENABLED;
  resetTelemetryRuleEngineConfig();
});

describe('the configured default', () => {
  it('the rule engine is OFF with no configuration -- zero behavioural change is the shipped default', () => {
    expect(getTelemetryRuleEngineConfig().enabled).toBe(false);
  });

  it('is enabled only by the exact string "true"', () => {
    process.env.TELEMETRY_RULE_ENGINE_ENABLED = 'true';
    expect(resolveTelemetryRuleEngineConfig().enabled).toBe(true);

    process.env.TELEMETRY_RULE_ENGINE_ENABLED = 'false';
    expect(resolveTelemetryRuleEngineConfig().enabled).toBe(false);
  });

  it('refuses an ambiguous value rather than silently choosing a path', () => {
    for (const value of ['1', '0', 'yes', 'no', 'on', 'off', 'Trues', 'enabled']) {
      process.env.TELEMETRY_RULE_ENGINE_ENABLED = value;
      expect(() => resolveTelemetryRuleEngineConfig()).toThrow(TelemetryRuleEngineConfigError);
    }
  });

  it('tolerates case and surrounding whitespace', () => {
    for (const value of ['TRUE', ' true ', 'True']) {
      process.env.TELEMETRY_RULE_ENGINE_ENABLED = value;
      expect(resolveTelemetryRuleEngineConfig().enabled).toBe(true);
    }
    for (const value of ['FALSE', ' false ']) {
      process.env.TELEMETRY_RULE_ENGINE_ENABLED = value;
      expect(resolveTelemetryRuleEngineConfig().enabled).toBe(false);
    }
  });

  it('caches until reset, so a flag flip mid-process needs an explicit reset (matches attention-dispatch.config)', () => {
    expect(getTelemetryRuleEngineConfig().enabled).toBe(false);

    process.env.TELEMETRY_RULE_ENGINE_ENABLED = 'true';
    expect(getTelemetryRuleEngineConfig().enabled).toBe(false); // still cached

    resetTelemetryRuleEngineConfig();
    expect(getTelemetryRuleEngineConfig().enabled).toBe(true);
  });
});
