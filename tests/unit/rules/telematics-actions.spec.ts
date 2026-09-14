// tests/unit/rules/telematics-actions.spec.ts
//
// WAVE 2 -- `create_telemetry_alert`, the action a telemetry-driven rule
// uses to record and notify an alert. This suite is the DIRECT parity
// check against reading-alerts.ts's own three derivations: same message
// text, same `value` semantics (a count for DTC codes, not the joined
// string), same threshold passthrough, and the same "IMPLEMENTED OR
// EXPLICITLY UNSUPPORTED" contract for every type this executor does
// not yet render.

jest.mock('@/modules/telematics/services/telemetry-alert-writer', () => ({
  recordAndNotifyAlert: jest.fn(),
}));

import { ruleActionRegistry } from '@/modules/rules/registry/RuleActionRegistry';
import { registerTelematicsRuleActions, TelemetryRuleActionInputError } from '@/modules/rules/actions/telematics-actions';
import { recordAndNotifyAlert } from '@/modules/telematics/services/telemetry-alert-writer';
import type { RuleAction, RuleEvaluationContext } from '@/modules/rules/types/rule.types';

const recordAndNotifyAlertMock = recordAndNotifyAlert as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';

function action(type: string, params: Record<string, unknown> = {}): RuleAction {
  return { type: 'create_telemetry_alert', params: { type, severity: 'high', ...params } };
}

beforeAll(() => {
  registerTelematicsRuleActions();
});

beforeEach(() => {
  jest.clearAllMocks();
  recordAndNotifyAlertMock.mockResolvedValue(undefined);
});

async function execute(ruleAction: RuleAction, context: RuleEvaluationContext): Promise<void> {
  await ruleActionRegistry.execute(ruleAction, context, TENANT);
}

describe('registration', () => {
  it('registers create_telemetry_alert idempotently', () => {
    expect(ruleActionRegistry.isRegistered('create_telemetry_alert')).toBe(true);
    expect(() => registerTelematicsRuleActions()).not.toThrow();
  });
});

describe('input validation -- fails clearly rather than fabricating', () => {
  it('refuses when context.vehicleId is missing', async () => {
    await expect(execute(action('speeding'), { location: { speed: 140 } })).rejects.toThrow(
      TelemetryRuleActionInputError
    );
    expect(recordAndNotifyAlertMock).not.toHaveBeenCalled();
  });

  it('refuses an unrecognised type', async () => {
    await expect(
      execute(action('not_a_real_type'), { vehicleId: 'v-1', location: { speed: 140 } })
    ).rejects.toThrow(/params.type to be one of/);
  });

  it('refuses an unrecognised severity', async () => {
    const badAction: RuleAction = {
      type: 'create_telemetry_alert',
      params: { type: 'speeding', severity: 'catastrophic' },
    };
    await expect(execute(badAction, { vehicleId: 'v-1', location: { speed: 140 } })).rejects.toThrow(
      /params.severity to be one of/
    );
  });

  it.each(['hard_brake', 'hard_accel', 'idle', 'geofence', 'vendor'])(
    'fails clearly for the valid-but-unimplemented type "%s" (IMPLEMENTED OR EXPLICITLY UNSUPPORTED)',
    async (type) => {
      await expect(execute(action(type), { vehicleId: 'v-1' })).rejects.toThrow(
        /does not yet implement type/
      );
      expect(recordAndNotifyAlertMock).not.toHaveBeenCalled();
    }
  );
});

describe('parity with reading-alerts.ts: speeding', () => {
  it('reproduces the exact message and value reading-alerts.ts would have derived', async () => {
    await execute(action('speeding', { threshold: 120 }), {
      vehicleId: 'v-1',
      orgUnitId: 'unit-harare',
      location: { speed: 140 },
      timestamp: new Date('2026-08-01T10:00:00Z'),
    });

    expect(recordAndNotifyAlertMock).toHaveBeenCalledWith(
      'v-1',
      {
        type: 'speeding',
        severity: 'high',
        message: 'Vehicle exceeding speed limit: 140 km/h',
        value: 140,
        threshold: 120,
        timestamp: new Date('2026-08-01T10:00:00Z'),
      },
      TENANT,
      'unit-harare'
    );
  });

  it('refuses rather than fabricating a value when location.speed is not actually a number', async () => {
    await expect(
      execute(action('speeding'), { vehicleId: 'v-1', location: {} })
    ).rejects.toThrow(/requires a numeric context.location.speed/);
    await expect(execute(action('speeding'), { vehicleId: 'v-1' })).rejects.toThrow(
      /requires a numeric context.location.speed/
    );
  });
});

describe('parity with reading-alerts.ts: engine (DTC codes)', () => {
  it('stores the CODE COUNT as value, and joins the codes into the message', async () => {
    await execute(
      { type: 'create_telemetry_alert', params: { type: 'engine', severity: 'critical' } },
      { vehicleId: 'v-1', engine: { dtcCodes: ['P0301', 'P0420'] }, timestamp: new Date('2026-08-01T10:00:00Z') }
    );

    expect(recordAndNotifyAlertMock).toHaveBeenCalledWith(
      'v-1',
      expect.objectContaining({
        type: 'engine',
        severity: 'critical',
        message: 'Engine fault codes detected: P0301, P0420',
        value: 2, // the COUNT, not the joined string -- matches reading-alerts.ts exactly
      }),
      TENANT,
      undefined
    );
    const [, writtenAlert] = recordAndNotifyAlertMock.mock.calls[0];
    expect(writtenAlert.threshold).toBeUndefined();
  });

  it('refuses when dtcCodes is absent or empty, rather than alerting on nothing', async () => {
    for (const engine of [undefined, {}, { dtcCodes: [] }]) {
      await expect(
        execute({ type: 'create_telemetry_alert', params: { type: 'engine', severity: 'critical' } }, {
          vehicleId: 'v-1',
          engine,
        })
      ).rejects.toThrow(/requires a non-empty context.engine.dtcCodes array/);
    }
  });
});

describe('parity with reading-alerts.ts: maintenance (low fuel)', () => {
  it('alerts on a genuinely reported 0%, matching the absent-vs-zero distinction', async () => {
    await execute(action('maintenance', { threshold: 10 }), {
      vehicleId: 'v-1',
      engine: { fuelLevel: 0 },
      timestamp: new Date('2026-08-01T10:00:00Z'),
    });

    expect(recordAndNotifyAlertMock).toHaveBeenCalledWith(
      'v-1',
      expect.objectContaining({
        type: 'maintenance',
        message: 'Low fuel level: 0%',
        value: 0,
        threshold: 10,
      }),
      TENANT,
      undefined
    );
  });

  it('refuses when fuelLevel is absent -- an unreporting device must never alert', async () => {
    await expect(
      execute(action('maintenance'), { vehicleId: 'v-1', engine: {} })
    ).rejects.toThrow(/requires a numeric context.engine.fuelLevel/);
  });
});

describe('timestamp handling', () => {
  it('uses the reading\'s own timestamp, not "now"', async () => {
    const readingTime = new Date('2020-01-01T00:00:00Z');
    await execute(action('speeding'), { vehicleId: 'v-1', location: { speed: 999 }, timestamp: readingTime });

    const [, writtenAlert] = recordAndNotifyAlertMock.mock.calls[0];
    expect(writtenAlert.timestamp).toEqual(readingTime);
  });

  it('accepts an ISO string timestamp (defensive; contexts are normally real Date objects)', async () => {
    await execute(action('speeding'), {
      vehicleId: 'v-1',
      location: { speed: 999 },
      timestamp: '2020-01-01T00:00:00.000Z',
    });

    const [, writtenAlert] = recordAndNotifyAlertMock.mock.calls[0];
    expect(writtenAlert.timestamp).toEqual(new Date('2020-01-01T00:00:00.000Z'));
  });
});
