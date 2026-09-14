// tests/unit/telematics/telemetry-alert-writer.spec.ts
//
// WAVE 2 -- telemetry-alert-writer.ts is the single implementation of
// "record and notify an alert" shared by the legacy reading-alerts.ts
// path (TelematicsService.processAlerts) and the new rule-engine
// `create_telemetry_alert` action. This suite pins its behaviour
// directly, independent of either caller, so a future change to either
// caller cannot silently change what "recording an alert" means without
// this suite noticing.
//
// Everything here mirrors the ORIGINAL TelematicsService.processAlerts
// behaviour byte-for-byte (see the file's own header): same call order
// (resolve ownership -> persist -> websocket emit -> conditional
// notify), same websocket event/payload, same notification shape, same
// severity gate.

jest.mock('@/modules/telematics/repositories/telematics.repository', () => ({
  telematicsRepository: { createAlert: jest.fn() },
}));
jest.mock('@/infrastructure/websocket/server', () => ({
  webSocketManager: { emitToOrgUnit: jest.fn(), emitToTenant: jest.fn(), emitToUser: jest.fn() },
}));
jest.mock('@/modules/notifications/services/notification.service', () => ({
  notificationService: { sendBulkNotification: jest.fn() },
}));
jest.mock('@/server/tenancy/organization-resolver', () => ({
  resolveOrganization: jest.fn(),
}));
jest.mock('@/modules/telematics/services/alert-ownership.resolver', () => ({
  resolveAlertOwnership: jest.fn(),
}));

import { telematicsRepository } from '@/modules/telematics/repositories/telematics.repository';
import { webSocketManager } from '@/infrastructure/websocket/server';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { resolveOrganization } from '@/server/tenancy/organization-resolver';
import { resolveAlertOwnership } from '@/modules/telematics/services/alert-ownership.resolver';
import { getFleetManagerIds, recordAndNotifyAlert } from '@/modules/telematics/services/telemetry-alert-writer';
import type { TelematicsAlert } from '@/modules/telematics/types/telematics.types';

const createAlertMock = telematicsRepository.createAlert as jest.Mock;
const emitToOrgUnitMock = webSocketManager.emitToOrgUnit as jest.Mock;
const sendBulkNotificationMock = notificationService.sendBulkNotification as jest.Mock;
const resolveOrganizationMock = resolveOrganization as jest.Mock;
const resolveAlertOwnershipMock = resolveAlertOwnership as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';

function alert(overrides: Partial<TelematicsAlert> = {}): TelematicsAlert {
  return {
    type: 'speeding',
    severity: 'high',
    message: 'Vehicle exceeding speed limit: 140 km/h',
    value: 140,
    threshold: 120,
    timestamp: new Date('2026-08-01T10:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resolveAlertOwnershipMock.mockResolvedValue({ orgUnitId: 'unit-harare', resolution: 'vehicle' });
});

describe('getFleetManagerIds', () => {
  it('returns owners and fleet managers only', async () => {
    resolveOrganizationMock.mockResolvedValue({
      members: [
        { userId: 'u1', role: 'organization_owner' },
        { userId: 'u2', role: 'fleet_manager' },
        { userId: 'u3', role: 'driver' },
      ],
    });

    const ids = await getFleetManagerIds(TENANT);

    expect(ids).toEqual(['u1', 'u2']);
  });

  it('degrades to an empty list when the organization cannot be found', async () => {
    resolveOrganizationMock.mockResolvedValue(null);
    await expect(getFleetManagerIds(TENANT)).resolves.toEqual([]);
  });

  it('degrades to an empty list rather than throwing when the lookup fails', async () => {
    resolveOrganizationMock.mockRejectedValue(new Error('mongo down'));
    await expect(getFleetManagerIds(TENANT)).resolves.toEqual([]);
  });
});

describe('recordAndNotifyAlert', () => {
  it('resolves ownership, persists, and emits the websocket event in order', async () => {
    const calls: string[] = [];
    resolveAlertOwnershipMock.mockImplementation(async () => {
      calls.push('ownership');
      return { orgUnitId: 'unit-harare', resolution: 'vehicle' };
    });
    createAlertMock.mockImplementation(async () => {
      calls.push('create');
    });
    emitToOrgUnitMock.mockImplementation(() => {
      calls.push('emit');
    });

    await recordAndNotifyAlert('v-1', alert(), TENANT, 'unit-harare', ['fm-1']);

    expect(calls).toEqual(['ownership', 'create', 'emit']);
    expect(createAlertMock).toHaveBeenCalledWith('v-1', expect.objectContaining({ type: 'speeding' }), TENANT, {
      orgUnitId: 'unit-harare',
      resolution: 'vehicle',
    });
    expect(emitToOrgUnitMock).toHaveBeenCalledWith(TENANT, 'unit-harare', 'vehicle:alert', {
      vehicleId: 'v-1',
      alert: expect.objectContaining({ type: 'speeding' }),
    });
  });

  it.each(['critical', 'high'] as const)(
    'notifies the given fleet manager ids for %s severity',
    async (severity) => {
      await recordAndNotifyAlert('v-1', alert({ severity }), TENANT, 'unit-harare', ['fm-1', 'fm-2']);

      expect(sendBulkNotificationMock).toHaveBeenCalledWith(
        ['fm-1', 'fm-2'],
        TENANT,
        expect.objectContaining({
          type: 'alert',
          priority: severity === 'critical' ? 'critical' : 'high',
        })
      );
    }
  );

  it.each(['low', 'medium'] as const)('does not notify for %s severity', async (severity) => {
    await recordAndNotifyAlert('v-1', alert({ severity }), TENANT, 'unit-harare', ['fm-1']);
    expect(sendBulkNotificationMock).not.toHaveBeenCalled();
  });

  it('does not notify when there are no recipients, even at critical severity', async () => {
    await recordAndNotifyAlert('v-1', alert({ severity: 'critical' }), TENANT, 'unit-harare', []);
    expect(sendBulkNotificationMock).not.toHaveBeenCalled();
  });

  it('resolves fleet manager ids lazily when the caller omits them, and only for a qualifying severity', async () => {
    resolveOrganizationMock.mockResolvedValue({
      members: [{ userId: 'fm-3', role: 'fleet_manager' }],
    });

    await recordAndNotifyAlert('v-1', alert({ severity: 'low' }), TENANT, 'unit-harare');
    expect(resolveOrganizationMock).not.toHaveBeenCalled();

    await recordAndNotifyAlert('v-1', alert({ severity: 'high' }), TENANT, 'unit-harare');
    expect(resolveOrganizationMock).toHaveBeenCalledTimes(1);
    expect(sendBulkNotificationMock).toHaveBeenCalledWith(['fm-3'], TENANT, expect.anything());
  });

  it('still records the alert when ownership cannot be resolved (fail closed on visibility, not on data loss)', async () => {
    resolveAlertOwnershipMock.mockResolvedValue({ resolution: 'vehicle-not-found' });

    await recordAndNotifyAlert('v-ghost', alert(), TENANT, undefined, []);

    expect(createAlertMock).toHaveBeenCalledWith('v-ghost', expect.anything(), TENANT, {
      resolution: 'vehicle-not-found',
    });
  });

  it('propagates a failure from the write itself rather than swallowing it', async () => {
    createAlertMock.mockRejectedValue(new Error('duplicate key'));
    await expect(recordAndNotifyAlert('v-1', alert(), TENANT, 'unit-harare', [])).rejects.toThrow(
      'duplicate key'
    );
  });
});
