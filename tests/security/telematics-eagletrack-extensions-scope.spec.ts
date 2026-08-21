// tests/security/telematics-eagletrack-extensions-scope.spec.ts
//
// Tenancy and scoping for the Eagle Track extensions.
//
// The failure this file exists to catch is a WRITE escalation, not a
// read leak. A tracker link decides which vehicle a device's telemetry
// is attributed to. If a caller could supply the link's orgUnitId, or
// link a tracker to a vehicle outside their scope, they would redirect
// another branch's movement history, odometer and fuel readings into
// their own vehicle -- corrupting that branch's data in a way that is
// unwindable only by hand. Same shape as the Phase G procurement
// approve bug, but it corrupts telemetry rather than spend.

import fs from 'fs';
import path from 'path';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import { assertVehicleInScope } from '../../modules/telematics/services/telematics-scope.utils';
import { eagletrackTrackerLinkService } from '../../modules/telematics/services/eagletrack-tracker-link.service';
import { vehicleRepository } from '../../modules/vehicles/repositories/vehicle.repository';
import { eagletrackTrackerLinkRepository } from '../../modules/telematics/repositories/eagletrack-tracker-link.repository';
import { eagletrackConfigRepository } from '../../modules/telematics/repositories/eagletrack-config.repository';
import { NotFoundError, ConflictError, ValidationError } from '../../server/errors/app.errors';

jest.mock('../../modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: { findById: jest.fn() },
}));
jest.mock('../../modules/telematics/repositories/eagletrack-tracker-link.repository', () => {
  class FakeRepo {
    static isVehicleIdShaped(id: string) {
      return /^[0-9a-fA-F]{24}$/.test(id);
    }
  }
  return {
    EagleTrackTrackerLinkRepository: FakeRepo,
    eagletrackTrackerLinkRepository: {
      findByUin: jest.fn(),
      upsert: jest.fn(),
      removeInScope: jest.fn(),
      listInScope: jest.fn(),
      mapByUin: jest.fn(),
    },
  };
});
jest.mock('../../modules/telematics/repositories/eagletrack-config.repository', () => ({
  eagletrackConfigRepository: { getConfig: jest.fn() },
}));

const mockedFindById = vehicleRepository.findById as jest.Mock;
const mockedFindByUin = eagletrackTrackerLinkRepository.findByUin as jest.Mock;
const mockedUpsert = eagletrackTrackerLinkRepository.upsert as jest.Mock;
const mockedRemove = eagletrackTrackerLinkRepository.removeInScope as jest.Mock;
const mockedListInScope = eagletrackTrackerLinkRepository.listInScope as jest.Mock;
const mockedGetConfig = eagletrackConfigRepository.getConfig as jest.Mock;

const VEHICLE_ID = '507f1f77bcf86cd799439011';

function context(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: 'willsgrove-farm-enterprises-9e80ed',
    accessibleOrgUnitIds,
  } as TenantContext;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUpsert.mockImplementation(async (input) => ({
    ...input,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    updatedBy: 'u1',
  }));
});

describe('assertVehicleInScope', () => {
  it('refuses a vehicle in another org unit', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: 'ADY2531', orgUnitId: 'bulawayo' });
    await expect(assertVehicleInScope(VEHICLE_ID, context(['harare']))).rejects.toThrow(NotFoundError);
  });

  it('refuses an UNASSIGNED vehicle for a scoped caller -- ownership cannot be established', async () => {
    // Not "unassigned means shared". A vehicle is owned by exactly one
    // branch; if nobody recorded which, that is missing information, not
    // permission. This also keeps the check consistent with the scoped
    // repository reads that follow it, which would return nothing anyway.
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: 'ADY2531' });
    await expect(assertVehicleInScope(VEHICLE_ID, context(['harare']))).rejects.toThrow(NotFoundError);
  });

  it('allows an unassigned vehicle for an org-wide caller', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: 'ADY2531' });
    await expect(assertVehicleInScope(VEHICLE_ID, context(null))).resolves.toMatchObject({
      vehicleId: VEHICLE_ID,
    });
  });

  it('throws NotFound rather than Forbidden, so ids cannot be probed', async () => {
    // A 403 confirms the vehicle exists, which tells a caller probing
    // ids something about another branch's fleet.
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: 'X', orgUnitId: 'bulawayo' });
    await expect(assertVehicleInScope(VEHICLE_ID, context(['harare']))).rejects.toThrow(NotFoundError);
  });
});

describe('tracker link writes', () => {
  it('DERIVES orgUnitId from the vehicle and never from the caller', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: 'ADY2531', orgUnitId: 'harare' });
    mockedFindByUin.mockResolvedValue(null);

    await eagletrackTrackerLinkService.createLink(
      { uin: '861234567890123', vehicleId: VEHICLE_ID },
      context(['harare', 'harare.logistics']),
      'user-1'
    );

    expect(mockedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ orgUnitId: 'harare', vehicleId: VEHICLE_ID }),
      'user-1'
    );
  });

  it('refuses to link a tracker to a vehicle outside the caller scope', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: 'X', orgUnitId: 'bulawayo' });
    await expect(
      eagletrackTrackerLinkService.createLink(
        { uin: '861234567890123', vehicleId: VEHICLE_ID },
        context(['harare']),
        'user-1'
      )
    ).rejects.toThrow(NotFoundError);
    expect(mockedUpsert).not.toHaveBeenCalled();
  });

  it('rejects a license plate in the vehicleId field', async () => {
    // The link stores the vehicle _id. Plates are mutable, and a
    // re-plated vehicle would silently break a plate-keyed link.
    await expect(
      eagletrackTrackerLinkService.createLink(
        { uin: '861234567890123', vehicleId: 'ADY2531' },
        context(null),
        'user-1'
      )
    ).rejects.toThrow(ValidationError);
  });

  it("refuses to silently re-point an existing link at a different vehicle", async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: 'ADY2531', orgUnitId: 'harare' });
    mockedFindByUin.mockResolvedValue({ uin: '861234567890123', vehicleId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });

    await expect(
      eagletrackTrackerLinkService.createLink(
        { uin: '861234567890123', vehicleId: VEHICLE_ID },
        context(['harare']),
        'user-1'
      )
    ).rejects.toThrow(ConflictError);
  });

  it('blocks on a conflicting link owned by ANOTHER branch', async () => {
    // Checked without the org-unit predicate on purpose: otherwise two
    // branches could hold conflicting links for one tracker and the
    // sync's answer would depend on document order.
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: 'ADY2531', orgUnitId: 'harare' });
    mockedFindByUin.mockResolvedValue({
      uin: '861234567890123',
      vehicleId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      orgUnitId: 'bulawayo',
    });

    await expect(
      eagletrackTrackerLinkService.createLink(
        { uin: '861234567890123', vehicleId: VEHICLE_ID },
        context(['harare']),
        'user-1'
      )
    ).rejects.toThrow(ConflictError);
  });

  it('404s an unlink that matched nothing in scope', async () => {
    mockedRemove.mockResolvedValue(false);
    await expect(
      eagletrackTrackerLinkService.removeLink('861234567890123', context(['harare']), 'user-1')
    ).rejects.toThrow(NotFoundError);
  });
});

describe('tracker mapping overview', () => {
  it('returns an empty worklist when Eagle Track has never synced', async () => {
    mockedGetConfig.mockResolvedValue(null);
    mockedListInScope.mockResolvedValue([]);

    const overview = await eagletrackTrackerLinkService.getOverview(context(null));
    expect(overview.unmatched).toEqual([]);
    expect(overview.eagletrackConfigured).toBe(false);
  });
});

describe('schema surface', () => {
  it('never accepts orgUnitId from a request body', () => {
    // Mirrors the finance schema guard. A caller who can stamp their own
    // scope onto a link can redirect another branch's telemetry.
    const source = fs.readFileSync(
      path.join(__dirname, '../../shared/validations/eagletrack.schema.ts'),
      'utf8'
    );
    expect(source).not.toContain('orgUnitId');
  });
});

describe('module scope registration', () => {
  it('registers every new Eagle Track collection', () => {
    // The conformance suite fails CI on an unregistered collection, and
    // an unregistered collection is one nobody has made a scoping
    // decision about.
    const source = fs.readFileSync(
      path.join(__dirname, '../../server/tenancy/module-scope.registry.ts'),
      'utf8'
    );
    expect(source).toContain('tbltelematics_eagletrack_links');
    expect(source).toContain('tbltelematics_eagletrack_triggers');
    expect(source).toContain('tblgeocode_cache');
  });
});
