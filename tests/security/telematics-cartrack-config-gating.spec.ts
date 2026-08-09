// tests/security/telematics-cartrack-config-gating.spec.ts
//
// Cartrack credentials (accountId/apiKey/apiSecret) are org-wide
// integration secrets, not per-user or per-org-unit data (see
// cartrack-config.repository.ts's header), so the property worth
// proving here isn't org-unit scoping -- it's:
//
//   1. Every Cartrack route (config read/write, test-connection, sync)
//      requires ORG_SETTINGS or the stronger VEHICLE_EDIT for the
//      mutating sync action, matching the existing wiring in
//      app/api/telematics/cartrack/*/route.ts, so a caller who can view
//      vehicles cannot read or rotate the organization's Cartrack
//      credentials.
//   2. GET/PUT config never returns the decrypted (or encrypted) API
//      secret to the client -- only whether one is configured, plus the
//      non-secret accountId/apiKey/baseUrl.
//   3. PUT config validates the payload (cartrackConfigSchema) before
//      it reaches the repository -- an invalid body must not be
//      persisted.

import * as fs from 'fs';
import * as path from 'path';
import type { NextRequest } from 'next/server';
import { cartrackController } from '../../modules/telematics/controllers/cartrack.controller';
import { cartrackConfigRepository } from '../../modules/telematics/repositories/cartrack-config.repository';

jest.mock('../../modules/telematics/repositories/cartrack-config.repository', () => ({
  cartrackConfigRepository: { getConfig: jest.fn(), upsertConfig: jest.fn() },
}));
jest.mock('../../modules/telematics/adapters/cartrack/cartrack.adapter', () => ({
  cartrackAdapter: { testConnection: jest.fn(), syncOrganization: jest.fn() },
}));
jest.mock('../../server/utils/context.utils', () => ({
  getTenantFromRequest: jest.fn().mockResolvedValue('willsgrove-farm-enterprises-9e80ed'),
  getUserIdFromRequest: jest.fn().mockResolvedValue('user-1'),
}));

const mockedGetConfig = cartrackConfigRepository.getConfig as jest.Mock;
const mockedUpsertConfig = cartrackConfigRepository.upsertConfig as jest.Mock;

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe('CartrackController never leaks the API secret to the client', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /config omits apiSecret and apiSecretEncrypted even though the repository record carries the ciphertext', async () => {
    mockedGetConfig.mockResolvedValue({
      tenantId: 'willsgrove-farm-enterprises-9e80ed',
      enabled: true,
      accountId: 'acc-123',
      apiKey: 'key-123',
      apiSecretEncrypted: 'ciphertext:should-never-reach-the-client',
      baseUrl: 'https://fleetapi.cartrack.com',
    });

    const response = await cartrackController.getConfig(makeRequest(undefined));
    const body = await response.json();

    expect(body.data).not.toHaveProperty('apiSecret');
    expect(body.data).not.toHaveProperty('apiSecretEncrypted');
    expect(body.data.configured).toBe(true);
    expect(body.data.accountId).toBe('acc-123');
  });

  it('PUT /config rejects an invalid payload and never calls upsertConfig', async () => {
    const response = await cartrackController.saveConfig(
      makeRequest({ enabled: true, accountId: '', apiKey: '', apiSecret: '', baseUrl: 'not-a-url' })
    );
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(mockedUpsertConfig).not.toHaveBeenCalled();
  });

  it('PUT /config with a valid payload persists it scoped to the caller tenant, and the response still omits apiSecret', async () => {
    mockedUpsertConfig.mockResolvedValue({
      tenantId: 'willsgrove-farm-enterprises-9e80ed',
      enabled: true,
      accountId: 'acc-123',
      apiKey: 'key-123',
      apiSecretEncrypted: 'ciphertext',
      baseUrl: 'https://fleetapi.cartrack.com',
    });

    const response = await cartrackController.saveConfig(
      makeRequest({
        enabled: true,
        accountId: 'acc-123',
        apiKey: 'key-123',
        apiSecret: 'super-secret-value',
        baseUrl: 'https://fleetapi.cartrack.com',
      })
    );
    const body = await response.json();

    expect(mockedUpsertConfig).toHaveBeenCalledWith(
      'willsgrove-farm-enterprises-9e80ed',
      expect.objectContaining({ accountId: 'acc-123' }),
      'user-1'
    );
    expect(body.data).not.toHaveProperty('apiSecret');
    expect(JSON.stringify(body.data)).not.toContain('super-secret-value');
  });
});

describe('Cartrack routes require the documented permissions', () => {
  it('GET/PUT config require ORG_SETTINGS', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/telematics/cartrack/config/route.ts'),
      'utf8'
    );

    expect(src).toContain('withAuth');
    const getBlock = src.slice(src.indexOf('export const GET'), src.indexOf('export const PUT'));
    const putBlock = src.slice(src.indexOf('export const PUT'));
    expect(getBlock).toContain('Permission.ORG_SETTINGS');
    expect(putBlock).toContain('Permission.ORG_SETTINGS');
  });

  it('POST test-connection requires ORG_SETTINGS, same as reading/writing config', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/telematics/cartrack/test-connection/route.ts'),
      'utf8'
    );

    expect(src).toContain('withAuth');
    expect(src).toContain('Permission.ORG_SETTINGS');
  });

  it('POST sync requires VEHICLE_EDIT (it writes vehicle GPS data, not org settings)', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/telematics/cartrack/sync/route.ts'),
      'utf8'
    );

    expect(src).toContain('withAuth');
    expect(src).toContain('Permission.VEHICLE_EDIT');
  });
});