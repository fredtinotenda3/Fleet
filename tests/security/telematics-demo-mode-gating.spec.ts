// tests/security/telematics-demo-mode-gating.spec.ts
//
// Demo Mode is a whole-tenant switch (see demo.controller.ts's file
// header: "not org-unit scoped ... decides whether the WHOLE
// organization's live map shows simulated or real data"), so unlike
// every other telematics read path it is deliberately NOT gated through
// resolveTenantContext/org-unit scoping -- it uses the tenant-only
// getTenantFromRequest. That is a documented design choice, not an
// oversight, so what this suite actually needs to prove is narrower:
//
//   1. Viewing status only requires VEHICLE_VIEW; toggling it requires
//      the stronger VEHICLE_EDIT -- so a read-only fleet viewer can see
//      whether the map they're looking at is simulated, but can't flip
//      every other viewer in the org onto demo data.
//   2. The toggle validates its payload (demoModeToggleSchema) BEFORE
//      touching the repository -- an invalid body must not reach
//      demoStateRepository.setEnabled at all.
//   3. The state repository call is tenant-scoped (by tenantId, from
//      the same getTenantFromRequest the read path uses), matching the
//      documented whole-org-switch design rather than silently drifting
//      to some other identifier.

import * as fs from 'fs';
import * as path from 'path';
import type { NextRequest } from 'next/server';
import { demoController } from '../../modules/telematics/controllers/demo.controller';
import { demoStateRepository } from '../../modules/telematics/repositories/demo-state.repository';

jest.mock('../../modules/telematics/repositories/demo-state.repository', () => ({
  demoStateRepository: { getState: jest.fn(), setEnabled: jest.fn() },
}));
jest.mock('../../server/utils/context.utils', () => ({
  getTenantFromRequest: jest.fn().mockResolvedValue('willsgrove-farm-enterprises-9e80ed'),
  getUserIdFromRequest: jest.fn().mockResolvedValue('user-1'),
}));

const mockedGetState = demoStateRepository.getState as jest.Mock;
const mockedSetEnabled = demoStateRepository.setEnabled as jest.Mock;

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe('DemoController.setStatus validates before writing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a non-boolean `enabled` and never calls the repository', async () => {
    const response = await demoController.setStatus(makeRequest({ enabled: 'yes' }));
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(mockedSetEnabled).not.toHaveBeenCalled();
  });

  it('rejects a missing `enabled` field and never calls the repository', async () => {
    const response = await demoController.setStatus(makeRequest({}));
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(mockedSetEnabled).not.toHaveBeenCalled();
  });

  it('a valid payload reaches the repository scoped by the caller tenant', async () => {
    mockedSetEnabled.mockResolvedValue({
      tenantId: 'willsgrove-farm-enterprises-9e80ed',
      enabled: true,
      startedAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await demoController.setStatus(makeRequest({ enabled: true }));
    const body = await response.json();

    expect(mockedSetEnabled).toHaveBeenCalledWith(
      'willsgrove-farm-enterprises-9e80ed',
      true,
      'user-1'
    );
    expect(body.success).toBe(true);
    expect(body.data.enabled).toBe(true);
  });
});

describe('DemoController.getStatus', () => {
  it('reports disabled with no startedAt when no state document exists yet', async () => {
    mockedGetState.mockResolvedValue(null);

    const response = await demoController.getStatus(makeRequest(undefined));
    const body = await response.json();

    expect(body.data).toEqual({ enabled: false, startedAt: undefined });
  });
});

describe('the demo mode routes require the documented permissions', () => {
  it('GET requires VEHICLE_VIEW (any authenticated member can see whether demo mode is on)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../app/api/telematics/demo/route.ts'), 'utf8');

    const getBlock = src.slice(src.indexOf('export const GET'), src.indexOf('export const POST'));
    expect(getBlock).toContain('withAuth');
    expect(getBlock).toContain('Permission.VEHICLE_VIEW');
  });

  it('POST (toggle) requires the stronger VEHICLE_EDIT, not VEHICLE_VIEW', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../app/api/telematics/demo/route.ts'), 'utf8');

    const postBlock = src.slice(src.indexOf('export const POST'));
    expect(postBlock).toContain('withAuth');
    expect(postBlock).toContain('Permission.VEHICLE_EDIT');
  });
});