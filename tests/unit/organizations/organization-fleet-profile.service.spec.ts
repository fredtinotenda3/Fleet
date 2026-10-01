// tests/unit/organizations/organization-fleet-profile.service.spec.ts
//
// ADAPTIVE ONBOARDING -- OrganizationService.updateFleetProfile().
//
// The property under test is the one real correctness bug this method
// exists specifically to avoid: BaseRepository.update() does
// `$set: { fleetProfile: <value> }`, which REPLACES the whole
// sub-document. Without an application-level merge, declaring
// "no reliable odometers" today would silently erase yesterday's
// "no GPS" declaration (and vice versa) -- two independent operator
// decisions, written by two independent actions, sharing one
// sub-document. See the method's own header in organization.service.ts.

import { OrganizationService } from '../../../modules/organizations/services/organization.service';
import { OrganizationRepository } from '../../../modules/organizations/repositories/organization.repository';
import { AdminUserRepository } from '../../../modules/organizations/repositories/admin-user.repository';
import { resolveOrganization } from '../../../server/tenancy/organization-resolver';
import type { Organization } from '../../../shared/types/organization.types';

jest.mock('../../../server/tenancy/organization-resolver', () => ({
  resolveOrganization: jest.fn(),
}));
jest.mock('../../../infrastructure/monitoring/audit.logger', () => ({
  auditLog: { logUpdate: jest.fn(), log: jest.fn() },
}));

const mockedResolveOrganization = resolveOrganization as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';

function makeOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    _id: 'org-1',
    tenantId: TENANT,
    name: 'Willsgrove Farm Enterprises',
    slug: TENANT,
    ...overrides,
  } as Organization;
}

describe('OrganizationService.updateFleetProfile', () => {
  let repo: { update: jest.Mock };
  let service: OrganizationService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = { update: jest.fn() };
    service = new OrganizationService(repo as unknown as OrganizationRepository, {} as AdminUserRepository);
  });

  it('merges a new declaration onto an EXISTING fleetProfile instead of replacing the whole sub-document', async () => {
    const existing = makeOrganization({
      fleetProfile: { operatesWithoutGps: true, setupCompletedAt: '2026-07-01T00:00:00.000Z' },
    });
    mockedResolveOrganization.mockResolvedValue(existing);
    repo.update.mockResolvedValue(
      makeOrganization({
        fleetProfile: {
          operatesWithoutGps: true,
          setupCompletedAt: '2026-07-01T00:00:00.000Z',
          operatesWithoutOdometers: true,
        },
      })
    );

    await service.updateFleetProfile(TENANT, { operatesWithoutOdometers: true }, TENANT, 'user-1');

    // The write sent to the repository must carry BOTH the pre-existing
    // fields AND the new one -- never just the new field alone (which
    // would be what a plain $set replace does, wiping the other two).
    expect(repo.update).toHaveBeenCalledWith(
      TENANT,
      {
        fleetProfile: {
          operatesWithoutGps: true,
          setupCompletedAt: '2026-07-01T00:00:00.000Z',
          operatesWithoutOdometers: true,
        },
      },
      TENANT,
      'user-1',
      true
    );
  });

  it('starts from an empty object when the organization has no fleetProfile yet', async () => {
    mockedResolveOrganization.mockResolvedValue(makeOrganization({ fleetProfile: undefined }));
    repo.update.mockResolvedValue(makeOrganization({ fleetProfile: { operatesWithoutGps: true } }));

    await service.updateFleetProfile(TENANT, { operatesWithoutGps: true }, TENANT, 'user-1');

    expect(repo.update).toHaveBeenCalledWith(
      TENANT,
      { fleetProfile: { operatesWithoutGps: true } },
      TENANT,
      'user-1',
      true
    );
  });

  it('lets a later declaration overwrite the SAME field (not merge-append a stale value)', async () => {
    mockedResolveOrganization.mockResolvedValue(
      makeOrganization({ fleetProfile: { operatesWithoutGps: true } })
    );
    repo.update.mockResolvedValue(makeOrganization({ fleetProfile: { operatesWithoutGps: false } }));

    // The fleet connects GPS later and the declaration is corrected.
    await service.updateFleetProfile(TENANT, { operatesWithoutGps: false }, TENANT, 'user-1');

    expect(repo.update).toHaveBeenCalledWith(
      TENANT,
      { fleetProfile: { operatesWithoutGps: false } },
      TENANT,
      'user-1',
      true
    );
  });
});
