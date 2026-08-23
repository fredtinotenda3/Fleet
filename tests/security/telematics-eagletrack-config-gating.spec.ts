// tests/security/telematics-eagletrack-config-gating.spec.ts
//
// The Eagle Track API token is an org-wide integration secret, not
// per-user or per-org-unit data (see eagletrack-config.repository.ts's
// header), so the properties worth proving are the same three the
// Cartrack suite proves:
//
//   1. Every Eagle Track route (config read/write, test-connection,
//      sync) requires ORG_SETTINGS, or the stronger VEHICLE_EDIT for the
//      mutating sync action -- so a caller who can view vehicles cannot
//      read or rotate the organization's Eagle Track credentials.
//   2. GET/PUT config never returns the token or its ciphertext -- only
//      whether one is configured, plus the non-secret domain.
//   3. PUT config validates the payload (eagletrackConfigSchema) before
//      it reaches the repository -- an invalid body must not persist.
//
// Property 2 is stricter here than for Cartrack. Cartrack's response
// legitimately carries accountId/apiKey, which are non-secret
// identifiers. Eagle Track has no such field: the static token IS the
// whole credential, so the assertions below check that NOTHING
// token-shaped appears in a response body, not merely that a named
// property is absent.

import * as fs from 'fs';
import * as path from 'path';
import type { NextRequest } from 'next/server';
import { eagletrackController } from '../../modules/telematics/controllers/eagletrack.controller';
import { eagletrackConfigRepository } from '../../modules/telematics/repositories/eagletrack-config.repository';

jest.mock('../../modules/telematics/repositories/eagletrack-config.repository', () => ({
  eagletrackConfigRepository: { getConfig: jest.fn(), upsertConfig: jest.fn() },
}));
jest.mock('../../modules/telematics/adapters/eagletrack/eagletrack.adapter', () => ({
  eagletrackAdapter: { testConnection: jest.fn(), syncOrganization: jest.fn() },
}));
/**
 * The controller gained history/fuel/trigger/tracker-link endpoints,
 * which resolve a full TenantContext rather than a bare tenantId. That
 * module reaches NextAuth and therefore `jose`, which ships as ESM and
 * cannot be parsed by this project's CommonJS ts-jest transform -- so an
 * unmocked import fails the whole SUITE at load time, before a single
 * assertion runs.
 *
 * Mocked here rather than by loosening the transform: the config-gating
 * assertions below are about validation and token redaction, and have no
 * business depending on how a session is decoded.
 */
jest.mock('../../server/utils/tenant-context.utils', () => ({
  resolveTenantContext: jest.fn().mockResolvedValue({
    organizationId: 'willsgrove-farm-enterprises-9e80ed',
    accessibleOrgUnitIds: null,
  }),
  resolveTenantContextWithUser: jest.fn().mockResolvedValue({
    context: {
      organizationId: 'willsgrove-farm-enterprises-9e80ed',
      accessibleOrgUnitIds: null,
    },
    userId: 'user-1',
  }),
}));
jest.mock('../../server/utils/context.utils', () => ({
  getTenantFromRequest: jest.fn().mockResolvedValue('willsgrove-farm-enterprises-9e80ed'),
  getUserIdFromRequest: jest.fn().mockResolvedValue('user-1'),
}));

const mockedGetConfig = eagletrackConfigRepository.getConfig as jest.Mock;
const mockedUpsertConfig = eagletrackConfigRepository.upsertConfig as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
// PHASE 0, F-6: was a 26-character literal in exactly the shape of the
// real Eagle Track production token. Replaced with an obviously
// synthetic value -- this suite asserts config GATING, so the token's
// content is irrelevant to every assertion in it.
const PLAINTEXT_TOKEN = 'TEST_EAGLETRACK_TOKEN_synthetic';
const CIPHERTEXT = 'v1:aXY=:dGFn:Y2lwaGVydGV4dA==';

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe('EagleTrackController never leaks the API token to the client', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /config omits the token and its ciphertext even though the repository record carries the ciphertext', async () => {
    mockedGetConfig.mockResolvedValue({
      tenantId: TENANT,
      enabled: true,
      domain: 'https://gps.example.com',
      tokenEncrypted: CIPHERTEXT,
    });

    const response = await eagletrackController.getConfig(makeRequest(undefined));
    const body = await response.json();

    expect(body.data).not.toHaveProperty('token');
    expect(body.data).not.toHaveProperty('tokenEncrypted');
    expect(JSON.stringify(body.data)).not.toContain(CIPHERTEXT);
    expect(body.data.configured).toBe(true);
    expect(body.data.domain).toBe('https://gps.example.com');
  });

  it('GET /config reports an unconfigured tenant without inventing a domain', async () => {
    mockedGetConfig.mockResolvedValue(null);

    const response = await eagletrackController.getConfig(makeRequest(undefined));
    const body = await response.json();

    expect(body.data).toEqual({ configured: false, enabled: false });
  });

  it('PUT /config rejects an invalid payload and never calls upsertConfig', async () => {
    const response = await eagletrackController.saveConfig(
      makeRequest({ enabled: true, domain: 'not-a-url', token: '' })
    );
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(mockedUpsertConfig).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing domain', { enabled: true, token: PLAINTEXT_TOKEN }],
    ['an empty domain', { enabled: true, domain: '', token: PLAINTEXT_TOKEN }],
    ['a non-http scheme', { enabled: true, domain: 'ftp://gps.example.com', token: PLAINTEXT_TOKEN }],
    ['a missing token', { enabled: true, domain: 'https://gps.example.com' }],
    ['a non-boolean enabled', { enabled: 'yes', domain: 'https://gps.example.com', token: PLAINTEXT_TOKEN }],
  ])('PUT /config with %s never reaches the repository', async (_label, payload) => {
    const response = await eagletrackController.saveConfig(makeRequest(payload));
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(mockedUpsertConfig).not.toHaveBeenCalled();
  });

  it('PUT /config with a valid payload persists it scoped to the caller tenant, and the response still omits the token', async () => {
    mockedUpsertConfig.mockResolvedValue({
      tenantId: TENANT,
      enabled: true,
      domain: 'https://gps.example.com',
      tokenEncrypted: CIPHERTEXT,
    });

    const response = await eagletrackController.saveConfig(
      makeRequest({ enabled: true, domain: 'https://gps.example.com', token: PLAINTEXT_TOKEN })
    );
    const body = await response.json();

    expect(mockedUpsertConfig).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ domain: 'https://gps.example.com', token: PLAINTEXT_TOKEN }),
      'user-1'
    );
    expect(body.data).not.toHaveProperty('token');
    expect(JSON.stringify(body.data)).not.toContain(PLAINTEXT_TOKEN);
    expect(JSON.stringify(body.data)).not.toContain(CIPHERTEXT);
  });

  it('does not return even a PREFIX of the token -- a partial static token is still a leak', async () => {
    mockedGetConfig.mockResolvedValue({
      tenantId: TENANT,
      enabled: true,
      domain: 'https://gps.example.com',
      tokenEncrypted: CIPHERTEXT,
    });

    const response = await eagletrackController.getConfig(makeRequest(undefined));
    const serialized = JSON.stringify(await response.json());

    for (let length = 6; length <= CIPHERTEXT.length; length += 1) {
      expect(serialized).not.toContain(CIPHERTEXT.slice(0, length));
    }
  });
});

describe('Eagle Track routes require the documented permissions', () => {
  it('GET/PUT config require ORG_SETTINGS', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/telematics/eagletrack/config/route.ts'),
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
      path.resolve(__dirname, '../../app/api/telematics/eagletrack/test-connection/route.ts'),
      'utf8'
    );

    expect(src).toContain('withAuth');
    expect(src).toContain('Permission.ORG_SETTINGS');
  });

  it('POST sync requires VEHICLE_EDIT (it writes vehicle GPS data, not org settings)', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/telematics/eagletrack/sync/route.ts'),
      'utf8'
    );

    expect(src).toContain('withAuth');
    expect(src).toContain('Permission.VEHICLE_EDIT');
  });

  it('every Eagle Track route file is wrapped in withAuth -- no unguarded handler slipped in', () => {
    const dir = path.resolve(__dirname, '../../app/api/telematics/eagletrack');
    const routeFiles: string[] = [];

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const candidate = path.join(dir, entry.name, 'route.ts');
        if (fs.existsSync(candidate)) routeFiles.push(candidate);
      }
    }

    expect(routeFiles.length).toBeGreaterThanOrEqual(3);

    for (const file of routeFiles) {
      const src = fs.readFileSync(file, 'utf8');
      const exportedHandlers = src.match(/export const (GET|POST|PUT|PATCH|DELETE)/g) ?? [];
      expect(exportedHandlers.length).toBeGreaterThan(0);
      // One withAuth wrapper per exported handler.
      expect((src.match(/withAuth\(/g) ?? []).length).toBe(exportedHandlers.length);
      expect(src).toContain('Permission.');
    }
  });
});

describe('the token is encrypted at rest with the shared EncryptionService', () => {
  // Not a behavioural test but a structural one: the requirement is
  // "same helper, same call sites, no new crypto". A future edit that
  // reaches for its own cipher, or stores the token verbatim, fails here.
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../modules/telematics/repositories/eagletrack-config.repository.ts'),
    'utf8'
  );

  it('encrypts on write and decrypts only in getResolvedConfig', () => {
    expect(src).toContain("from '@/infrastructure/secrets/encryption.service'");
    expect(src).toContain('encryptionService.encrypt(input.token)');
    expect(src).toContain('encryptionService.decrypt(tokenEncrypted)');
  });

  it('introduces no crypto of its own', () => {
    expect(src).not.toContain("require('crypto')");
    expect(src).not.toContain("from 'crypto'");
    expect(src).not.toContain('createCipheriv');
  });

  it('never persists a plaintext `token` field', () => {
    // The stored document field is tokenEncrypted; a `token:` key in the
    // $set payload would mean the raw credential hit the database.
    expect(src).not.toMatch(/\btoken:\s*input\.token\b/);
  });
});
