// tests/unit/onboarding/setup-landing.service.spec.ts
//
// ADAPTIVE ONBOARDING -- shouldRouteToSetupCentre(), the post-login
// redirect decision used by app/page.tsx (server-side) and
// GET /api/organizations/setup-status (client-side, via
// LoginPage.tsx/MfaVerifyPage.tsx).
//
// This function must NEVER be the reason a login fails or loops --
// every property below protects that, not just the "happy path".

import { shouldRouteToSetupCentre } from '../../../server/onboarding/setup-landing.service';
import { organizationService } from '../../../modules/organizations/services/organization.service';
import { vehicleRepository } from '../../../modules/vehicles/repositories/vehicle.repository';
import { Permission } from '../../../server/permissions/roles';

jest.mock('../../../modules/organizations/services/organization.service', () => ({
  organizationService: { getOrganization: jest.fn() },
}));
jest.mock('../../../modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: { count: jest.fn() },
}));

const mockedGetOrganization = organizationService.getOrganization as jest.Mock;
const mockedCount = vehicleRepository.count as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';

// A real role that resolves to holding Permission.ORG_SETTINGS (one of
// ANCHOR_SETUP_PERMISSIONS) -- mirrored from how other tests in this
// codebase exercise permissionService rather than mocking it away.
const OWNER_ROLES = ['organization_owner'];
const DRIVER_ROLES = ['driver'];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('shouldRouteToSetupCentre', () => {
  it('returns false when tenantId is missing', async () => {
    await expect(shouldRouteToSetupCentre(OWNER_ROLES, undefined)).resolves.toBe(false);
    await expect(shouldRouteToSetupCentre(OWNER_ROLES, '')).resolves.toBe(false);
    expect(mockedGetOrganization).not.toHaveBeenCalled();
  });

  it('returns false for a user holding no setup (anchor) permission, without even querying the organization', async () => {
    await expect(shouldRouteToSetupCentre(DRIVER_ROLES, TENANT)).resolves.toBe(false);
    expect(mockedGetOrganization).not.toHaveBeenCalled();
    expect(mockedCount).not.toHaveBeenCalled();
  });

  it('returns true for a setup-permission holder whose organization has zero vehicles and no recorded setup decision', async () => {
    mockedGetOrganization.mockResolvedValue({ fleetProfile: undefined });
    mockedCount.mockResolvedValue(0);

    await expect(shouldRouteToSetupCentre(OWNER_ROLES, TENANT)).resolves.toBe(true);
    expect(mockedGetOrganization).toHaveBeenCalledWith(TENANT, TENANT);
    expect(mockedCount).toHaveBeenCalledWith({}, TENANT);
  });

  it('returns false once the organization has at least one vehicle', async () => {
    mockedGetOrganization.mockResolvedValue({ fleetProfile: undefined });
    mockedCount.mockResolvedValue(3);

    await expect(shouldRouteToSetupCentre(OWNER_ROLES, TENANT)).resolves.toBe(false);
  });

  it('returns false once setupCompletedAt is recorded, even with zero vehicles', async () => {
    mockedGetOrganization.mockResolvedValue({
      fleetProfile: { setupCompletedAt: '2026-08-01T00:00:00.000Z' },
    });
    mockedCount.mockResolvedValue(0);

    await expect(shouldRouteToSetupCentre(OWNER_ROLES, TENANT)).resolves.toBe(false);
    // Short-circuits before the (more expensive) vehicle count query.
    expect(mockedCount).not.toHaveBeenCalled();
  });

  it('returns false once setupDismissedAt is recorded -- an explicit skip is honored, never forced back', async () => {
    mockedGetOrganization.mockResolvedValue({
      fleetProfile: { setupDismissedAt: '2026-08-01T00:00:00.000Z' },
    });
    mockedCount.mockResolvedValue(0);

    await expect(shouldRouteToSetupCentre(OWNER_ROLES, TENANT)).resolves.toBe(false);
    expect(mockedCount).not.toHaveBeenCalled();
  });

  it('fails open (false) when the organization lookup throws, never propagating the error', async () => {
    mockedGetOrganization.mockRejectedValue(new Error('db unreachable'));

    await expect(shouldRouteToSetupCentre(OWNER_ROLES, TENANT)).resolves.toBe(false);
  });

  it('fails open (false) when the vehicle count query throws', async () => {
    mockedGetOrganization.mockResolvedValue({ fleetProfile: undefined });
    mockedCount.mockRejectedValue(new Error('db unreachable'));

    await expect(shouldRouteToSetupCentre(OWNER_ROLES, TENANT)).resolves.toBe(false);
  });
});
