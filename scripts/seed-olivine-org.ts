// scripts/seed-olivine-org.ts
//
// Creates the "Olivine Group" ORGANIZATION itself (tblorganizations row
// + one owner account) -- the one step neither `tenancy-provision.ts`
// nor any other script in this repo does. `tenancy-provision.ts` only
// builds the branch/department/workshop/fleet hierarchy and the full
// per-role user ladder INSIDE an organization that already exists
// (`resolveTargetOrganization` throws if `--org` matches nothing); it
// never creates the organization row itself. Confirmed by reading that
// script in full before writing this one, rather than assumed.
//
// Deliberately minimal and does NOT duplicate tenancy-provision.ts's
// branch/fleet/role-ladder logic (that would be the same "parallel
// implementation of already-solved logic" this whole engagement has
// been avoiding elsewhere). This script's only job is to get exactly
// one real "Olivine Group" row into tblorganizations with one owner
// account, so tenancy-provision.ts can then target it via `--org
// <printed-tenantId>` and build everything else through its own
// existing, already-reviewed path.
//
// Reuses the exact, already-confirmed-working
// createOwnerAccount/organizationService.createOrganization sequence
// from scripts/seed-enterprise-org.ts (Toyota Zimbabwe/Honda Zimbabwe)
// -- same two calls, same order, same reasoning (createOrganization
// requires an existing ownerId; it does not create the account itself).
//
// Idempotent in the same sense as seed-enterprise-org.ts:
// createOwnerAccount looks up the email before creating it, and
// organizationService.createOrganization itself throws a ConflictError
// if an organization with the derived slug's BASE name already exists
// -- re-running this after a successful run will fail loudly on that
// conflict rather than silently creating a second "Olivine Group".
// That failure is the correct, safe behaviour: if you need a fresh
// Olivine org, use a different --name, don't re-run this blindly.
//
// Run with:
//   npx tsx scripts/seed-olivine-org.ts
//   npx tsx scripts/seed-olivine-org.ts --name "Olivine Group" --owner-email owner@olivine.test --owner-name "Olivine Owner"
//
// The owner password is printed to stdout ONCE and is not stored
// anywhere but its bcrypt hash (same discipline as tenancy-provision.ts
// and seed-enterprise-org.ts). Override it with SEED_OLIVINE_PASSWORD
// if you need a fixed value for local dev; otherwise a random one is
// generated per run.

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { adminUserRepository } from '@/modules/organizations/repositories/admin-user.repository';
import { organizationService } from '@/modules/organizations/services/organization.service';
import { Role } from '@/server/permissions/roles';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function argValue(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function generatePassword(): string {
  const fixed = process.env.SEED_OLIVINE_PASSWORD;
  if (fixed) return fixed;
  // Same alphabet/shape as tenancy-provision.ts's generatePassword --
  // 12 url-safe chars, no ambiguous glyphs, plus a fixed suffix so a
  // printed password is never mistaken for one missing a character.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return `${out}!7`;
}

async function createOwnerAccount(email: string, name: string, password: string): Promise<string> {
  const existing = await adminUserRepository.findByEmail(email);
  if (existing) {
    console.log(`${DIM}Owner account ${email} already exists -- reusing it, not re-creating.${RESET}`);
    return existing._id!.toString();
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const created = await adminUserRepository.create({
    Email: email,
    Password: passwordHash,
    FirstName: name,
    Role: Role.ORGANIZATION_OWNER,
  });
  return created._id.toString();
}

async function main(): Promise<void> {
  const orgName = argValue('name') ?? 'Olivine Group';
  const ownerEmail = argValue('owner-email') ?? 'owner@olivine.test';
  const ownerName = argValue('owner-name') ?? 'Olivine Owner';
  const password = generatePassword();

  await connectToDatabase();

  console.log('');
  console.log(`${BOLD}Seeding Olivine organization${RESET}`);
  console.log(`${DIM}${'='.repeat(74)}${RESET}`);
  console.log(`  Organization name : ${orgName}`);
  console.log(`  Owner email       : ${ownerEmail}`);
  console.log('');

  const ownerId = await createOwnerAccount(ownerEmail, ownerName, password);

  const organization = await organizationService.createOrganization({
    name: orgName,
    ownerId,
    ownerEmail,
    ownerName,
  });

  const tenantId = organization.tenantId; // == organization.slug -- what every downstream repo call scopes by

  console.log(`${GREEN}Created "${organization.name}" (${organization._id})${RESET}`);
  console.log(`  tenantId : ${CYAN}${tenantId}${RESET}`);
  console.log('');
  console.log(`${BOLD}Owner credentials (printed once -- not stored anywhere but the bcrypt hash)${RESET}`);
  console.log(`  email    : ${ownerEmail}`);
  console.log(`  password : ${password}`);
  console.log('');
  console.log(`${BOLD}Next step${RESET} -- build the branch/department/workshop/fleet hierarchy and`);
  console.log('the full per-role user ladder (branch manager, driver, mechanic, accountant,');
  console.log('auditor, the fail-closed "unassigned" control account, etc.) inside this org,');
  console.log('using the existing, already-reviewed tenancy-provision.ts script -- do NOT');
  console.log('hand-create those accounts; this script deliberately does not duplicate that logic:');
  console.log('');
  console.log(`  ${CYAN}npm run tenancy:provision -- --org ${tenantId}${RESET}          ${DIM}# dry run first -- review the plan${RESET}`);
  console.log(`  ${CYAN}npm run tenancy:provision -- --org ${tenantId} --confirm${RESET}  ${DIM}# then commit it${RESET}`);
  console.log('');
  console.log('That second command prints a full credentials table (one account per role,');
  console.log(`each scoped correctly) under the ${CYAN}@olivine.test${RESET} email domain -- derived from`);
  console.log('this organization\'s own name, not the Willsgrove demo org\'s domain (see the');
  console.log('fix in tenancy-provision.ts\'s resolveTargetOrganization/deriveEmailDomain).');
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
