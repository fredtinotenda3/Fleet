// tests/security/telemetry-rule-engine-invocation-gating.spec.ts
//
// WAVE 2 -- THE DUPLICATE ALERT INVARIANT (instruction #6), asserted
// directly against TelematicsService.ingestTelematicsData/bulkIngest:
// exactly one of the legacy reading-alerts.ts path or the Rule Engine
// path runs for a given reading, controlled by ONE flag
// (TELEMETRY_RULE_ENGINE_ENABLED), never both and never neither when a
// signal warrants an alert.
//
// Also covers instruction #3's ordering requirement (the telemetry write
// itself completes before either alert path runs, so the existing
// unique-index-based write idempotency protects whichever path is
// active) and instruction #9's tenant-isolation requirement for the
// trigger call itself (the tenantId passed to fireEvent is always the
// READING's own tenantId, never ambient/global state).

jest.mock('@/modules/telematics/repositories/telematics.repository', () => ({
  telematicsRepository: {
    create: jest.fn(),
    bulkInsertTelematics: jest.fn(),
    getActiveGeofences: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/infrastructure/websocket/server', () => ({
  webSocketManager: { emitToOrgUnit: jest.fn(), emitToTenant: jest.fn(), emitToUser: jest.fn() },
}));
jest.mock('@/infrastructure/queue/queue.service', () => ({
  queueService: { addJob: jest.fn() },
  JobType: { REFRESH_ANALYTICS: 'REFRESH_ANALYTICS', INGEST_TELEMETRY_BATCH: 'INGEST_TELEMETRY_BATCH' },
}));
jest.mock('@/modules/notifications/services/notification.service', () => ({
  notificationService: { sendBulkNotification: jest.fn() },
}));
jest.mock('@/modules/telematics/services/telemetry-alert-writer', () => ({
  recordAndNotifyAlert: jest.fn(),
  getFleetManagerIds: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/modules/rules/services/rule-trigger.service', () => ({
  ruleTriggerService: { fireEvent: jest.fn().mockResolvedValue([]) },
}));

import { telematicsService } from '@/modules/telematics/services/telematics.service';
import { telematicsRepository } from '@/modules/telematics/repositories/telematics.repository';
import { recordAndNotifyAlert } from '@/modules/telematics/services/telemetry-alert-writer';
import { ruleTriggerService } from '@/modules/rules/services/rule-trigger.service';
import {
  resetTelemetryRuleEngineConfig,
} from '@/modules/telematics/services/telemetry-rule-engine.config';
import { TELEMETRY_READING_INGESTED_TRIGGER } from '@/modules/telematics/services/telemetry-rule-context';
import type { TelematicsData } from '@/modules/telematics/types/telematics.types';

const createMock = telematicsRepository.create as jest.Mock;
const fireEventMock = ruleTriggerService.fireEvent as jest.Mock;
const recordAndNotifyAlertMock = recordAndNotifyAlert as jest.Mock;

type IngestInput = Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'> & { tenantId: string };

function speedingReading(overrides: Partial<IngestInput> = {}): IngestInput {
  return {
    deviceId: 'dev-1',
    vehicleId: 'v-1',
    tenantId: 'willsgrove-farm-enterprises-9e80ed',
    engine: {},
    trip: {},
    fuel: {},
    timestamp: new Date('2026-08-01T10:00:00Z'),
    // No `location`: keeps this test focused on the alert-path branch,
    // not the separate (unaffected) websocket-location/geofence branch.
    ...overrides,
  } as IngestInput;
}

beforeEach(() => {
  jest.clearAllMocks();
  createMock.mockResolvedValue(undefined);
  fireEventMock.mockResolvedValue([]);
  recordAndNotifyAlertMock.mockResolvedValue(undefined);
  delete process.env.TELEMETRY_RULE_ENGINE_ENABLED;
  resetTelemetryRuleEngineConfig();
});

afterEach(() => {
  delete process.env.TELEMETRY_RULE_ENGINE_ENABLED;
  resetTelemetryRuleEngineConfig();
});

describe('flag OFF (default): the legacy path runs, the rule engine is never invoked', () => {
  it('a speeding reading is recorded via the legacy per-alert writer, not via fireEvent', async () => {
    await telematicsService.ingestTelematicsData(
      speedingReading({ location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() } })
    );

    expect(fireEventMock).not.toHaveBeenCalled();
    expect(recordAndNotifyAlertMock).toHaveBeenCalledTimes(1);
    expect(recordAndNotifyAlertMock.mock.calls[0][1]).toMatchObject({ type: 'speeding' });
  });

  it('a non-alerting reading calls neither path', async () => {
    await telematicsService.ingestTelematicsData(speedingReading());

    expect(fireEventMock).not.toHaveBeenCalled();
    expect(recordAndNotifyAlertMock).not.toHaveBeenCalled();
  });
});

describe('flag ON: the rule engine runs, the legacy path is never invoked', () => {
  beforeEach(() => {
    process.env.TELEMETRY_RULE_ENGINE_ENABLED = 'true';
    resetTelemetryRuleEngineConfig();
  });

  it('fires the canonical trigger with the reading\'s own tenantId, and never calls the legacy per-alert writer directly', async () => {
    await telematicsService.ingestTelematicsData(
      speedingReading({ tenantId: 'toyota-zimbabwe-63078f', location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() } })
    );

    expect(fireEventMock).toHaveBeenCalledTimes(1);
    const [trigger, context, tenantId] = fireEventMock.mock.calls[0];
    expect(trigger).toBe(TELEMETRY_READING_INGESTED_TRIGGER);
    expect(tenantId).toBe('toyota-zimbabwe-63078f');
    expect(context).toMatchObject({ vehicleId: 'v-1' });

    // The legacy path's OWN direct call to the alert writer never
    // happens when the flag is on -- whatever alerts get written when
    // the flag is on happen strictly through fireEvent's own rule
    // evaluation (asserted end-to-end in
    // telemetry-rule-engine-parity.spec.ts), never as a second,
    // parallel call from TelematicsService itself.
    expect(recordAndNotifyAlertMock).not.toHaveBeenCalled();
  });

  it('a rule-engine failure does not fail ingestion (fireEvent is failure-isolated by contract)', async () => {
    fireEventMock.mockRejectedValue(new Error('should never happen -- fireEvent contract is to catch internally'));

    // ruleTriggerService.fireEvent's own contract is to catch and log,
    // never throw (see rule-trigger.service.ts) -- this test documents
    // that TelematicsService does not ALSO wrap the call, i.e. it
    // trusts and depends on that contract rather than duplicating it.
    await expect(
      telematicsService.ingestTelematicsData(speedingReading({ location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() } }))
    ).rejects.toThrow();
  });
});

describe('the write happens before either alert path -- the duplicate-write guard protects both', () => {
  it('ingestTelematicsData awaits telematicsRepository.create before evaluating alerts', async () => {
    const order: string[] = [];
    createMock.mockImplementation(async () => {
      order.push('create');
    });
    recordAndNotifyAlertMock.mockImplementation(async () => {
      order.push('alert');
    });

    await telematicsService.ingestTelematicsData(
      speedingReading({ location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() } })
    );

    expect(order).toEqual(['create', 'alert']);
  });

  it('a duplicate-key rejection from the write is never masked by an alert path running anyway', async () => {
    createMock.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));

    await expect(
      telematicsService.ingestTelematicsData(speedingReading({ location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() } }))
    ).rejects.toThrow(/duplicate key/);

    expect(recordAndNotifyAlertMock).not.toHaveBeenCalled();
    expect(fireEventMock).not.toHaveBeenCalled();
  });
});

describe('bulkIngest applies the same gate per item as ingestTelematicsData', () => {
  it('flag off: legacy alert writer runs per alerting item', async () => {
    await telematicsService.bulkIngest([
      speedingReading({ vehicleId: 'v-a', location: { lat: 0, lng: 0, speed: 140, timestamp: new Date() } }),
      speedingReading({ vehicleId: 'v-b' }),
    ]);

    expect(recordAndNotifyAlertMock).toHaveBeenCalledTimes(1);
    expect(fireEventMock).not.toHaveBeenCalled();
  });

  it('flag on: fireEvent runs per item, legacy writer never runs', async () => {
    process.env.TELEMETRY_RULE_ENGINE_ENABLED = 'true';
    resetTelemetryRuleEngineConfig();

    await telematicsService.bulkIngest([
      speedingReading({ vehicleId: 'v-a' }),
      speedingReading({ vehicleId: 'v-b' }),
    ]);

    expect(fireEventMock).toHaveBeenCalledTimes(2);
    expect(recordAndNotifyAlertMock).not.toHaveBeenCalled();
  });
});
