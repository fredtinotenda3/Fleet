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
const YELLOW = '\x1b[33m';
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

/**
 * FIX (credential-honesty bug, found while investigating a stuck
 * Olivine login): this used to return the EXISTING account's id on
 * reuse without touching its password -- but main() always prints the
 * freshly-generated `password` argument as "the" owner credential
 * regardless of which branch ran. If this account already existed
 * (e.g. a prior run of this script got partway through, or was run
 * twice), the printed password was simply FALSE: the account's real
 * stored hash was whatever an earlier run had set, not the one just
 * printed. That is exactly the class of thing the engagement's
 * never-fabricate-credentials rule exists to catch -- printing a
 * password that does not open the account is functionally the same
 * mistake as inventing one.
 *
 * Now the reuse path resets the stored hash to the SAME password being
 * printed, so the printed credential is always true. This script only
 * ever runs against a bootstrap/seed account under human control
 * (never end-user self-service), so resetting on every re-run is safe
 * and, given the alternative (silently-wrong printed credentials), is
 * the more honest default.
 */
async function createOwnerAccount(
  email: string,
  name: string,
  password: string
): Promise<{ id: string; reused: boolean }> {
  const existing = await adminUserRepository.findByEmail(email);
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    await adminUserRepository.resetPassword(existing._id!.toString(), passwordHash);
    console.log(
      `${YELLOW}Owner account ${email} already existed -- password RESET to the value printed below ` +
        `so it matches what you're about to use.${RESET}`
    );
    return { id: existing._id!.toString(), reused: true };
  }

  const created = await adminUserRepository.create({
    Email: email,
    Password: passwordHash,
    FirstName: name,
    Role: Role.ORGANIZATION_OWNER,
  });
  return { id: created._id.toString(), reused: false };
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

  const { id: ownerId, reused } = await createOwnerAccount(ownerEmail, ownerName, password);

  /**
   * FIX (credentials silently lost on a re-run): createOwnerAccount()
   * above may have just RESET this account's password in the database
   * -- that write already happened and cannot be undone by anything
   * below. The credentials must be printed now, before
   * createOrganization() gets a chance to throw ConflictError (which it
   * will, loudly, if this org already exists -- see this script's own
   * header). Printing credentials only after a call that can throw
   * meant a re-run against an existing org would reset the password in
   * the database, then crash with a stack trace before ever showing the
   * user what the new password was -- leaving the account's real
   * password known to nobody. Order now matches what actually happened,
   * not what was hoped to happen next.
   */
  console.log(`${BOLD}Owner credentials (printed once -- not stored anywhere but the bcrypt hash)${RESET}`);
  console.log(`  email    : ${ownerEmail}`);
  console.log(`  password : ${password}${reused ? `  ${DIM}(reset just now -- see note above)${RESET}` : ''}`);
  console.log('');

  let organization;
  try {
    organization = await organizationService.createOrganization({
      name: orgName,
      ownerId,
      ownerEmail,
      ownerName,
    });
  } catch (err) {
    console.log(`${YELLOW}The organization itself already exists (createOrganization threw), so no new`);
    console.log('tblorganizations row was created -- but the owner credentials printed above ARE');
    console.log(`live and correct as of right now, regardless.${RESET}`);
    console.log('');
    console.log('Look up this org\'s tenantId with:');
    console.log(`  ${CYAN}db.tblorganizations.findOne({ name: "${orgName}" }, { tenantId: 1 })${RESET}`);
    console.log('then continue with the db:repair / diagnose-login.ts steps below using that tenantId.');
    console.log('');
    throw err;
  }

  const tenantId = organization.tenantId; // == organization.slug -- what every downstream repo call scopes by

  console.log(`${GREEN}Created "${organization.name}" (${organization._id})${RESET}`);
  console.log(`  tenantId : ${CYAN}${tenantId}${RESET}`);
  console.log('');
  console.log(`${YELLOW}${BOLD}REQUIRED before this owner can log in${RESET}`);
  console.log(`${DIM}organizationService.createOrganization() requires an EXISTING ownerId (this`);
  console.log('account, created above), so it never stamps the new tenantId back onto this');
  console.log("owner's own tbladmin row. Left alone, this account's tenantId stays unset, and");
  console.log("modules/security/controllers/token.controller.ts falls back to the literal");
  console.log('string \'default\' at login -- which logs the owner in, but scoped to the wrong');
  console.log(`tenant (either an empty bucket, or -- worse -- another org's, if anything else`);
  console.log(`ever shares that same fallback). This is a pre-existing gap, also present in`);
  console.log(`scripts/seed-enterprise-org.ts's identical createOwnerAccount pattern -- not`);
  console.log(`something this script introduced.${RESET}`);
  console.log('');
  console.log('This repo already has the right tool for this -- an audited, dry-run-by-default');
  console.log('repair pass over every tbladmin account (not just this one), so it also catches');
  console.log('any other account already in this state:');
  console.log('');
  console.log(`  ${CYAN}npm run db:repair${RESET}        ${DIM}# dry run -- writes nothing, review reports/ output${RESET}`);
  console.log(`  ${CYAN}npm run db:repair:apply${RESET}  ${DIM}# commit exactly the reviewed plan${RESET}`);
  console.log('');
  console.log(`Confirm it worked with: ${CYAN}npx tsx diagnose-login.ts ${ownerEmail} "${password}"${RESET}`);
  console.log('(prints the resolved tenantId along with the password check -- run this BEFORE');
  console.log('trying to log in through the browser, so a login failure and a wrong-tenant');
  console.log('login never look identical from the outside.)');
  console.log('');
  console.log(`${BOLD}Next step${RESET} -- build the branch/department/workshop/fleet hierarchy and`);
  console.log('the full per-role user ladder (branch manager, driver, mechanic, accountant,');
  console.log('auditor, the fail-closed "unassigned" control account, etc.) inside this org,');
  console.log('using the existing, already-reviewed tenancy-provision.ts script -- do NOT');
  console.log('hand-create those accounts; this script deliberately does not duplicate that logic:');
  console.log('(every account THAT script creates goes through addMemberDirect(), which already');
  console.log('stamps tenantId correctly -- only this script\'s owner-creation step has the gap)');
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
