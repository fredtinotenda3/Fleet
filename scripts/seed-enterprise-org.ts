// scripts/seed-enterprise-org.ts
//
// Phase 7 test data: two fully isolated tenants (Toyota Zimbabwe,
// Honda Zimbabwe) with a realistic branch/fleet/workshop hierarchy and
// one user per role, each scoped via UserScopeAssignment.
//
// Everything below calls real, confirmed code:
//   - adminUserRepository.create()          (modules/organizations/repositories/admin-user.repository.ts)
//   - organizationService.createOrganization() (modules/organizations/services/organization.service.ts)
//   - orgUnitRepository (generic .create())  (modules/security/repositories/org-unit.repository.ts)
//   - organizationService.addMemberDirect()  -- creates the tbladmin account,
//     adds the OrganizationMember, AND creates the UserScopeAssignment in
//     one call when orgUnitId is passed. No separate userScopeService call
//     needed for role users; the owner is the only account created by hand
//     (createOrganization requires an existing ownerId, it doesn't create
//     the account itself).
//
// SEAT LIMIT FIX (this pass -- verification-only, no RBAC/business-logic
// change):
//   createOrganization() unconditionally sets subscription = { tier: 'free',
//   seats: 5, usedSeats: 1, ... } -- CreateOrganizationInput has no field to
//   override this, so every org starts on the free plan's 5 seats no
//   matter what's passed in. Toyota Zimbabwe needs 8 accounts (owner + 7
//   role users), which trips addMemberDirect()'s
//   `organization.members.length >= organization.subscription.seats`
//   check -- correctly, since that check is doing exactly its job against
//   real subscription data.
//
//   The fix is NOT to touch that check (it's the actual seat-limit
//   business rule, left completely alone) or anything in
//   organizationService, roles.ts, tenant-context.service.ts, or any
//   frontend file. Instead, immediately after createOrganization() returns,
//   this script calls organizationRepository.update() DIRECTLY to raise
//   that one seed organization's subscription.seats/tier -- the same
//   pattern organization.service.ts already uses internally for
//   updateContactDetails/updateBusinessHours/updateTaxSettings/updateLogo,
//   all of which call `this.repo.update(orgId, { ... } as any, ...)`
//   directly because the narrow public updateOrganization() whitelist
//   (name/branding/settings only) doesn't cover them either. This script
//   is simply the same "call the repo directly for a field the public
//   service method doesn't expose" pattern, scoped to the two orgs this
//   script creates. Production organizations created through the normal
//   signup flow are completely unaffected -- nothing here changes what
//   createOrganization() does for anyone else, and no seat check anywhere
//   is weakened, removed, or bypassed for the members this script adds:
//   they still count against (the now-higher) subscription.seats exactly
//   like any real member would.
//
// Run with:
//   npx tsx scripts/seed-enterprise-org.ts
//
// Credentials are printed to stdout at the end. Every account gets the
// same seed password unless overridden via SEED_DEFAULT_PASSWORD, so
// you don't have to scroll back through per-user temporary passwords
// during Phase E verification. Change all of these before shipping any
// of this data to a real environment.

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { adminUserRepository } from '@/modules/organizations/repositories/admin-user.repository';
import { organizationService } from '@/modules/organizations/services/organization.service';
import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';
import { orgUnitRepository } from '@/modules/security/repositories/org-unit.repository';
import { Role } from '@/server/permissions/roles';
import type { OrgUnitType } from '@/modules/security/types/org-unit.types';

const SEED_DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'FleetSeed!2026';

/**
 * Seed-only seat allowance. Generous headroom above what today's spec
 * needs (8 for Toyota, 2 for Honda) so adding one more role user to the
 * Phase E fixture later doesn't reproduce this exact failure again.
 * Override via env var if a future fixture needs more.
 */
const SEED_SEAT_COUNT = Number(process.env.SEED_SEAT_COUNT || 25);

interface CreatedAccount {
  email: string;
  role: string;
  orgUnit?: string;
}

const createdAccounts: CreatedAccount[] = [];

/**
 * Creates the owner's tbladmin account directly -- createOrganization()
 * requires an existing ownerId, it does not create the account itself
 * (see organization.service.ts: CreateOrganizationInput.ownerId is a
 * required field, not derived from ownerEmail/ownerName).
 */
async function createOwnerAccount(email: string, name: string): Promise<string> {
  const existing = await adminUserRepository.findByEmail(email);
  if (existing) {
    return existing._id!.toString();
  }
  const passwordHash = await bcrypt.hash(SEED_DEFAULT_PASSWORD, 10);
  const created = await adminUserRepository.create({
    Email: email,
    Password: passwordHash,
    FirstName: name,
    Role: Role.ORGANIZATION_OWNER,
  });
  return created._id.toString();
}

/**
 * SEAT LIMIT FIX: raises this seed organization's subscription seat
 * count (and tier, cosmetically, to reflect 8 real seeded users rather
 * than the free plan's 5) so addMemberDirect()'s seat-limit check --
 * left completely unmodified -- has enough real seats to pass against
 * for every role user this script adds. Same
 * `organizationRepository.update(id, { ... } as any, tenantId, userId, true)`
 * shape organization.service.ts already uses internally for fields its
 * own public updateOrganization() doesn't expose (contact/business-hours/
 * tax-settings/logo) -- not a new bypass invented for this script.
 */
async function raiseSeedOrgSeatLimit(
  organizationId: string,
  tenantId: string,
  ownerId: string,
  currentSubscription: Record<string, unknown>
): Promise<void> {
  await organizationRepository.update(
    organizationId,
    {
      subscription: {
        ...currentSubscription,
        tier: 'enterprise',
        seats: SEED_SEAT_COUNT,
      },
    } as any,
    tenantId,
    ownerId,
    true
  );
}

async function createOrgUnit(
  tenantId: string,
  type: OrgUnitType,
  name: string,
  parentId: string | null
): Promise<string> {
  const created = await (orgUnitRepository as any).create(
    { organizationId: tenantId, type, name, parentId, status: 'active' },
    tenantId,
    'system-seed'
  );
  return created._id as string;
}

interface SeedRoleUser {
  role: Role;
  name: string;
  email: string;
  /** org unit name (within this org's hierarchy) to scope this user to, if any */
  scopeToUnit?: string;
}

async function seedOrganization(config: {
  orgName: string;
  ownerEmail: string;
  ownerName: string;
  branches: Array<{ name: string; fleets: string[]; workshop: string }>;
  roleUsers: SeedRoleUser[];
}) {
  const ownerId = await createOwnerAccount(config.ownerEmail, config.ownerName);

  const organization = await organizationService.createOrganization({
    name: config.orgName,
    ownerId,
    ownerEmail: config.ownerEmail,
    ownerName: config.ownerName,
  });

  const organizationId = organization._id!;
  const tenantId = organization.tenantId; // slug -- what every downstream repo call scopes by

  // SEAT LIMIT FIX: do this before adding any role users below, so
  // every addMemberDirect() call in this function sees the raised
  // seat count, not the free-plan default of 5.
  await raiseSeedOrgSeatLimit(organizationId, tenantId, ownerId, organization.subscription as any);

  createdAccounts.push({ email: config.ownerEmail, role: Role.ORGANIZATION_OWNER });
  console.log(`\nCreated organization "${config.orgName}" (${organizationId}), tenantId=${tenantId}`);
  console.log(`  Owner: ${config.ownerEmail}`);
  console.log(`  Seat limit raised to ${SEED_SEAT_COUNT} for this seed org (seed-only, see file header)`);

  // orgUnit name -> id, so roleUsers can scope by name below
  const unitIdByName = new Map<string, string>();

  for (const branch of config.branches) {
    const branchId = await createOrgUnit(tenantId, 'branch', branch.name, null);
    unitIdByName.set(branch.name, branchId);
    console.log(`  Branch "${branch.name}" (${branchId})`);

    for (const fleetName of branch.fleets) {
      const fleetId = await createOrgUnit(tenantId, 'fleet', fleetName, branchId);
      unitIdByName.set(fleetName, fleetId);
      console.log(`    Fleet "${fleetName}" (${fleetId})`);
    }

    const workshopId = await createOrgUnit(tenantId, 'workshop', branch.workshop, branchId);
    unitIdByName.set(branch.workshop, workshopId);
    console.log(`    Workshop "${branch.workshop}" (${workshopId})`);
  }

  for (const roleUser of config.roleUsers) {
    const orgUnitId = roleUser.scopeToUnit ? unitIdByName.get(roleUser.scopeToUnit) : undefined;
    if (roleUser.scopeToUnit && !orgUnitId) {
      throw new Error(`Unknown org unit "${roleUser.scopeToUnit}" for user ${roleUser.email}`);
    }

    // addMemberDirect creates the tbladmin account (if it doesn't
    // already exist), adds the OrganizationMember row, AND creates the
    // UserScopeAssignment when orgUnitId is passed -- all in one call.
    // Its seat-limit check is untouched; it now simply has enough real
    // seats (raised above) to let this fixture's 8/2 real members
    // through, exactly as it would for any organization actually on an
    // enterprise-tier plan with this many seats.
    const result = await organizationService.addMemberDirect(
      organizationId,
      {
        name: roleUser.name,
        email: roleUser.email,
        role: roleUser.role,
        password: SEED_DEFAULT_PASSWORD,
        orgUnitId,
      },
      ownerId,
      tenantId
    );

    createdAccounts.push({
      email: roleUser.email,
      role: roleUser.role,
      orgUnit: roleUser.scopeToUnit,
    });

    const scopeNote = roleUser.scopeToUnit
      ? `scoped to "${roleUser.scopeToUnit}" (assigned=${result.orgUnitAssigned})`
      : 'organization-wide';
    console.log(`  ${roleUser.role} ${roleUser.email} -- ${scopeNote}`);
  }

  return { organizationId, tenantId };
}

async function main() {
  await connectToDatabase();

  // --- Organization 1: Toyota Zimbabwe ---------------------------------
  await seedOrganization({
    orgName: 'Toyota Zimbabwe',
    ownerEmail: 'john@toyota.com',
    ownerName: 'John Owner',
    branches: [
      { name: 'Harare Branch', fleets: ['Delivery Fleet', 'Service Fleet'], workshop: 'Harare Workshop' },
      { name: 'Bulawayo Branch', fleets: ['Regional Fleet'], workshop: 'Bulawayo Workshop' },
    ],
    roleUsers: [
      // ORGANIZATION_OWNER already created above; every remaining role
      // per the Phase 7 spec (Branch Manager, Fleet Manager, Workshop
      // Manager, Driver, Mechanic, Accountant, Viewer) below.
      {
        role: Role.BRANCH_MANAGER,
        name: 'Harare Branch Manager',
        email: 'branch.manager@toyota.com',
        scopeToUnit: 'Harare Branch',
      },
      {
        role: Role.FLEET_MANAGER,
        name: 'Delivery Fleet Manager',
        email: 'fleet.manager@toyota.com',
        scopeToUnit: 'Delivery Fleet',
      },
      {
        role: Role.WORKSHOP_MANAGER,
        name: 'Harare Workshop Manager',
        email: 'workshop.manager@toyota.com',
        scopeToUnit: 'Harare Workshop',
      },
      {
        role: Role.DRIVER,
        name: 'Test Driver',
        email: 'driver@toyota.com',
        scopeToUnit: 'Delivery Fleet',
      },
      {
        role: Role.MECHANIC,
        name: 'Test Mechanic',
        email: 'mechanic@toyota.com',
        scopeToUnit: 'Harare Workshop',
      },
      {
        role: Role.ACCOUNTANT,
        name: 'Test Accountant',
        email: 'accountant@toyota.com',
        // ACCOUNTANT isn't in ROLE_ORG_UNIT_LEVEL (unrestricted org
        // unit type) but still needs a UserScopeAssignment to see
        // anything -- it's not in FULL_ORG_UNIT_VISIBILITY_ROLES.
        // Scoped to the branch so they see that branch's spend.
        scopeToUnit: 'Harare Branch',
      },
      {
        role: Role.VIEWER,
        name: 'Test Viewer',
        email: 'viewer@toyota.com',
        scopeToUnit: 'Harare Branch',
      },
    ],
  });

  // --- Organization 2: Honda Zimbabwe (cross-tenant isolation control) -
  await seedOrganization({
    orgName: 'Honda Zimbabwe',
    ownerEmail: 'owner@honda.com',
    ownerName: 'Honda Owner',
    branches: [{ name: 'Msasa Branch', fleets: ['Main Fleet'], workshop: 'Msasa Workshop' }],
    roleUsers: [
      {
        role: Role.FLEET_MANAGER,
        name: 'Honda Fleet Manager',
        email: 'fleet.manager@honda.com',
        scopeToUnit: 'Main Fleet',
      },
    ],
  });

  console.log('\n================ SEEDED ACCOUNTS ================');
  console.log(`Password for every account: ${SEED_DEFAULT_PASSWORD}\n`);
  for (const acct of createdAccounts) {
    console.log(`  ${acct.email.padEnd(30)} ${acct.role}${acct.orgUnit ? `  (${acct.orgUnit})` : ''}`);
  }
  console.log('\nUse these to run PHASE_E_VERIFICATION.md.');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});