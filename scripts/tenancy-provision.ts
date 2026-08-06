// scripts/tenancy-provision.ts
//
// Builds the full tenancy ladder for one organization and provisions a
// user at every level so the isolation model can be exercised end to end.
//
//   Platform
//     +-- Organization            (Willsgrove Farm Enterprises)
//           +-- Branch            (Harare, Bulawayo)
//                 +-- Department  (Logistics, Maintenance)
//                       +-- Workshop
//                             +-- Fleet
//                                   +-- Users
//
// ---------------------------------------------------------------------
// Safety model -- read this before running
// ---------------------------------------------------------------------
//   * DRY RUN BY DEFAULT. Writes nothing without --confirm. The dry run
//     prints the exact plan, including the credentials it WOULD create,
//     so the whole outcome is reviewable before anything is committed.
//   * IDEMPOTENT. Re-running matches existing units by (organizationId,
//     type, name) and existing accounts by email, updating rather than
//     duplicating. Safe to run repeatedly while iterating.
//   * ADDITIVE. This script never deletes. Removing other organizations
//     is a separate, explicitly-named script (tenancy-purge.ts) because
//     destroying customer data should never be a side effect of a
//     provisioning command.
//   * Passwords are generated per run with crypto.randomBytes and
//     printed ONCE. They are not stored anywhere but the bcrypt hash.
//
// Usage:
//   npm run tenancy:provision                    # dry run
//   npm run tenancy:provision -- --confirm       # commit
//   npm run tenancy:provision -- --org <slug>    # target a different org
//   npm run tenancy:provision -- --password <pw> # fixed password (dev only)

/* eslint-disable no-console */

import { MongoClient, Db, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';

dotenv.config();

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

// ── CLI ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

/**
 * Guard against a Windows CMD footgun that has bitten this toolchain
 * before: cmd.exe has no `\` line continuation, so a multi-line command
 * copied from a runbook silently arrives as a literal `\` argument and
 * every flag after it is dropped -- including `--confirm`, which makes
 * a write run look like a no-op, or worse, drops a narrowing flag from
 * a run that DOES write.
 */
if (argv.includes('\\')) {
  console.error(
    `${RED}Refusing to run: a literal "\\" was passed as an argument.${RESET}\n` +
      'Windows CMD does not support "\\" line continuation, so the flags after\n' +
      'it were dropped. Put the whole command on one line.'
  );
  process.exit(1);
}

function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}

function value(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

const APPLY = flag('confirm');
const TARGET_ORG = value('org');
const FIXED_PASSWORD = value('password');

// ── The hierarchy to build ───────────────────────────────────────────

type UnitType = 'branch' | 'department' | 'workshop' | 'fleet' | 'team';

interface UnitSpec {
  key: string;
  type: UnitType;
  name: string;
  code: string;
  parent?: string;
}

/**
 * A deliberately asymmetric tree. Bulawayo is a shallow branch with a
 * fleet hanging directly off it, which exercises the widened
 * ALLOWED_PARENT_TYPES: if isolation only worked on the uniform
 * four-deep path, the tests would pass while real trees broke.
 */
const UNITS: UnitSpec[] = [
  { key: 'harare', type: 'branch', name: 'Harare Branch', code: 'HRE' },
  { key: 'bulawayo', type: 'branch', name: 'Bulawayo Branch', code: 'BYO' },

  { key: 'hre-logistics', type: 'department', name: 'Logistics Department', code: 'HRE-LOG', parent: 'harare' },
  { key: 'hre-maintenance', type: 'department', name: 'Maintenance Department', code: 'HRE-MTC', parent: 'harare' },

  { key: 'hre-workshop', type: 'workshop', name: 'Harare Central Workshop', code: 'HRE-WS1', parent: 'hre-maintenance' },
  { key: 'byo-workshop', type: 'workshop', name: 'Bulawayo Workshop', code: 'BYO-WS1', parent: 'bulawayo' },

  { key: 'hre-heavy', type: 'fleet', name: 'Harare Heavy Fleet', code: 'HRE-HVY', parent: 'hre-logistics' },
  { key: 'hre-light', type: 'fleet', name: 'Harare Light Fleet', code: 'HRE-LGT', parent: 'hre-logistics' },
  { key: 'hre-ws-fleet', type: 'fleet', name: 'Workshop Loan Fleet', code: 'HRE-LOAN', parent: 'hre-workshop' },
  { key: 'byo-fleet', type: 'fleet', name: 'Bulawayo Fleet', code: 'BYO-FLT', parent: 'bulawayo' },
];

// ── The users to provision ───────────────────────────────────────────

interface UserSpec {
  key: string;
  firstName: string;
  emailLocal: string;
  role: string;
  /**
   * Org unit key(s) this user is scoped to.
   *
   * FIX: this used to be a single optional `scopeUnit`, and "omitted"
   * was documented as meaning "organization-wide". That was wrong for
   * every role except three.
   *
   * Only SUPER_ADMIN / ORGANIZATION_OWNER / ORGANIZATION_ADMIN are in
   * FULL_ORG_UNIT_VISIBILITY_ROLES and resolve to
   * accessibleOrgUnitIds === null. ACCOUNTANT and AUDITOR are
   * scope-narrowed like everyone else, so provisioning them with NO
   * assignment made them fail closed to zero rows -- while the
   * credentials table cheerfully printed "organization-wide". The
   * tenancy report caught it: `accountant@` and `auditor@` both showed
   * "scope NOTHING / 0 vehicles visible".
   *
   * A non-full-visibility role that needs whole-organization reach must
   * be assigned to every ROOT branch; descendants follow automatically.
   */
  scopeUnits?: string[];
  /** What this account is for, printed in the credentials table. */
  expectation: string;
}

const USERS: UserSpec[] = [
  {
    key: 'owner',
    firstName: 'Org Owner',
    emailLocal: 'owner',
    role: 'organization_owner',
    expectation: 'Everything in Willsgrove. No other organization.',
  },
  {
    key: 'admin',
    firstName: 'Org Admin',
    emailLocal: 'admin',
    role: 'organization_admin',
    expectation: 'Same as owner (identical permission set), org-wide.',
  },
  {
    key: 'harare-manager',
    firstName: 'Harare Branch Mgr',
    emailLocal: 'harare.manager',
    role: 'branch_manager',
    scopeUnits: ['harare'],
    expectation: 'Harare branch + all departments/workshops/fleets under it. NOT Bulawayo.',
  },
  {
    key: 'bulawayo-manager',
    firstName: 'Bulawayo Branch Mgr',
    emailLocal: 'bulawayo.manager',
    role: 'branch_manager',
    scopeUnits: ['bulawayo'],
    expectation: 'Bulawayo branch subtree only. NOT Harare.',
  },
  {
    key: 'logistics-manager',
    firstName: 'Logistics Dept Mgr',
    emailLocal: 'logistics.manager',
    role: 'department_manager',
    scopeUnits: ['hre-logistics'],
    expectation: 'Logistics dept + its two fleets. Not the Maintenance dept, not Bulawayo.',
  },
  {
    key: 'workshop-manager',
    firstName: 'Workshop Mgr',
    emailLocal: 'workshop.manager',
    role: 'workshop_manager',
    scopeUnits: ['hre-workshop'],
    expectation: 'Harare Central Workshop + its loan fleet only.',
  },
  {
    key: 'fleet-manager',
    firstName: 'Heavy Fleet Mgr',
    emailLocal: 'fleet.manager',
    role: 'fleet_manager',
    scopeUnits: ['hre-heavy'],
    expectation: 'Harare Heavy Fleet only. The narrowest manager scope.',
  },
  {
    key: 'driver',
    firstName: 'Fleet Driver',
    emailLocal: 'driver',
    role: 'driver',
    scopeUnits: ['hre-heavy'],
    expectation: 'Own trips/shifts within Harare Heavy Fleet.',
  },
  {
    key: 'mechanic',
    firstName: 'Workshop Mechanic',
    emailLocal: 'mechanic',
    role: 'mechanic',
    scopeUnits: ['hre-workshop'],
    expectation: 'Work orders and bays in Harare Central Workshop.',
  },
  {
    key: 'accountant',
    firstName: 'Finance Officer',
    emailLocal: 'accountant',
    role: 'accountant',
    // Every root branch: ACCOUNTANT is not a full-visibility role, so
    // org-wide reach has to be granted explicitly via assignments.
    scopeUnits: ['harare', 'bulawayo'],
    expectation: 'Org-wide financials (expenses, fuel spend). No vehicle operations.',
  },
  {
    key: 'auditor',
    firstName: 'Read Only Auditor',
    emailLocal: 'auditor',
    role: 'auditor',
    scopeUnits: ['harare', 'bulawayo'],
    expectation: 'Org-wide read access. No writes anywhere.',
  },
  {
    key: 'unassigned',
    firstName: 'Unassigned User',
    emailLocal: 'unassigned',
    role: 'viewer',
    expectation:
      'THE FAIL-CLOSED CONTROL. A scoped role with NO scope assignment must see ' +
      'ZERO rows -- not the whole organization. If this account sees data, ' +
      'isolation is broken.',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Roles that resolve to accessibleOrgUnitIds === null. Mirrors
 * FULL_ORG_UNIT_VISIBILITY_ROLES in server/permissions/roles.ts -- kept
 * as a literal here so this script has no import cycle into the app's
 * permission layer, and cross-checked by the tenancy report.
 */
const FULL_VISIBILITY_ROLES = new Set([
  'super_admin',
  'organization_owner',
  'organization_admin',
]);

/**
 * The scope line printed in the credentials table.
 *
 * Says what the account will ACTUALLY see, rather than what was
 * intended. The previous version printed "organization-wide" for any
 * account with no scope unit, which was a lie for every role outside
 * FULL_VISIBILITY_ROLES -- they see nothing at all.
 */
function describeScope(spec: UserSpec): string {
  if (FULL_VISIBILITY_ROLES.has(spec.role)) {
    return 'organization-wide (by role)';
  }
  const units = spec.scopeUnits ?? [];
  if (units.length === 0) {
    return 'NONE - fail-closed, sees zero rows';
  }
  const names = units.map((k) => UNITS.find((u) => u.key === k)?.name ?? k);
  return `${names.join(' + ')} (+ descendants)`;
}

function generatePassword(): string {
  if (FIXED_PASSWORD) return FIXED_PASSWORD;
  // 12 chars, url-safe, no ambiguous glyphs to mistype from a terminal.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return `${out}!7`;
}

interface ResolvedOrg {
  canonicalTenantId: string;
  objectId: string;
  name: string;
  emailDomain: string;
}

async function resolveTargetOrganization(db: Db): Promise<ResolvedOrg> {
  const orgs = await db
    .collection('tblorganizations')
    .find({ isDeleted: { $ne: true } })
    .toArray();

  if (orgs.length === 0) {
    throw new Error('No organizations found in tblorganizations.');
  }

  let chosen = orgs[0];

  if (TARGET_ORG) {
    const match = orgs.find(
      (o) =>
        o.slug === TARGET_ORG ||
        o.tenantId === TARGET_ORG ||
        String(o._id) === TARGET_ORG
    );
    if (!match) {
      throw new Error(
        `No organization matches "${TARGET_ORG}". Available:\n` +
          orgs.map((o) => `  ${o.slug ?? o.tenantId}  (${o.name})`).join('\n')
      );
    }
    chosen = match;
  } else {
    const willsgrove = orgs.find((o) =>
      String(o.slug ?? o.tenantId ?? '').startsWith('willsgrove')
    );
    if (!willsgrove) {
      throw new Error(
        'No organization slug starting with "willsgrove" was found, and no ' +
          '--org was given. Pass --org <slug> explicitly rather than letting ' +
          'this script guess which customer to provision into.'
      );
    }
    chosen = willsgrove;
  }

  // Canonical order matches scripts/lib/tenant-identity.ts: the org's own
  // tenantId, then slug, then _id. This is the value business rows carry.
  const canonical =
    (typeof chosen.tenantId === 'string' && chosen.tenantId.trim()) ||
    (typeof chosen.slug === 'string' && chosen.slug.trim()) ||
    String(chosen._id);

  return {
    canonicalTenantId: canonical,
    objectId: String(chosen._id),
    name: String(chosen.name ?? canonical),
    emailDomain: 'willsgrove.test',
  };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(`${RED}MONGODB_URI is not set.${RESET}`);
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  try {
    const org = await resolveTargetOrganization(db);

    console.log('');
    console.log(`${BOLD}Tenancy provisioning${RESET}`);
    console.log(`${DIM}${'='.repeat(74)}${RESET}`);
    console.log(`  Organization : ${org.name}`);
    console.log(`  tenantId     : ${CYAN}${org.canonicalTenantId}${RESET}`);
    console.log(
      `  Mode         : ${APPLY ? `${GREEN}APPLY (writes)${RESET}` : `${YELLOW}DRY RUN (no writes)${RESET}`}`
    );
    console.log('');

    // ── 1. Org units ─────────────────────────────────────────────────

    const unitIds = new Map<string, string>();
    const unitPaths = new Map<string, string[]>();

    console.log(`${BOLD}Org units${RESET}`);

    for (const spec of UNITS) {
      const parentId = spec.parent ? unitIds.get(spec.parent) : null;
      const parentPath = spec.parent ? unitPaths.get(spec.parent) ?? [] : [];

      if (spec.parent && !parentId) {
        throw new Error(
          `Unit "${spec.key}" declares parent "${spec.parent}", which was not ` +
            'created. UNITS must be ordered parents-first.'
        );
      }

      const existing = await db.collection('tblorgunits').findOne({
        organizationId: org.canonicalTenantId,
        type: spec.type,
        name: spec.name,
        isDeleted: { $ne: true },
      });

      // `path` is the materialized ancestor chain, root-first, EXCLUDING
      // the unit itself -- matching OrgUnitRepository.getDescendantIds,
      // which finds descendants with `{ path: <ancestorId> }`. Getting
      // this wrong silently breaks descendant expansion, so it is
      // derived from the parent rather than hand-written per unit.
      const path = parentId ? [...parentPath, parentId] : [];

      if (existing) {
        unitIds.set(spec.key, String(existing._id));
        unitPaths.set(spec.key, path);
        console.log(`  ${DIM}exists${RESET}  ${spec.type.padEnd(10)} ${spec.name}`);
        continue;
      }

      const doc = {
        tenantId: org.canonicalTenantId,
        organizationId: org.canonicalTenantId,
        type: spec.type,
        name: spec.name,
        code: spec.code,
        parentId: parentId ?? null,
        path,
        depth: path.length,
        status: 'active',
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (APPLY) {
        const res = await db.collection('tblorgunits').insertOne(doc as never);
        unitIds.set(spec.key, String(res.insertedId));
      } else {
        // A stable placeholder so the dry run can still show the tree
        // and the scope assignments that would reference it.
        unitIds.set(spec.key, `dry-run-${spec.key}`);
      }
      unitPaths.set(spec.key, path);

      const indent = '  '.repeat(path.length);
      console.log(
        `  ${GREEN}create${RESET}  ${spec.type.padEnd(10)} ${indent}${spec.name} ${DIM}(${spec.code})${RESET}`
      );
    }

    console.log('');

    // ── 2. Users ─────────────────────────────────────────────────────

    console.log(`${BOLD}Accounts${RESET}`);

    const credentials: Array<{
      email: string;
      password: string;
      role: string;
      scope: string;
      expectation: string;
    }> = [];

    for (const spec of USERS) {
      const email = `${spec.emailLocal}@${org.emailDomain}`;
      const password = generatePassword();
      const passwordHash = await hash(password, 10);

      const existing = await db.collection('tbladmin').findOne({ Email: email });

      const userDoc = {
        FirstName: spec.firstName,
        Email: email,
        Password: passwordHash,
        Role: spec.role,
        roles: [spec.role],
        tenantId: org.canonicalTenantId,
        updatedAt: new Date(),
      };

      let userId: string;

      if (existing) {
        userId = String(existing._id);
        if (APPLY) {
          await db
            .collection('tbladmin')
            .updateOne({ _id: existing._id }, { $set: userDoc });
        }
        console.log(`  ${YELLOW}update${RESET}  ${email.padEnd(38)} ${spec.role}`);
      } else {
        if (APPLY) {
          const res = await db
            .collection('tbladmin')
            .insertOne({ ...userDoc, createdAt: new Date() } as never);
          userId = String(res.insertedId);
        } else {
          userId = `dry-run-${spec.key}`;
        }
        console.log(`  ${GREEN}create${RESET}  ${email.padEnd(38)} ${spec.role}`);
      }

      // ── Scope assignment ──
      //
      // Only for users that are scoped to a unit. An org-wide role
      // (owner/admin/accountant/auditor) must NOT get one: those roles
      // are in FULL_ORG_UNIT_VISIBILITY_ROLES and resolve to
      // accessibleOrgUnitIds === null. Giving them an assignment as well
      // would be harmless today but misleading tomorrow.
      //
      // The 'unassigned' control account deliberately gets none, which
      // is the entire point of it.
      for (const scopeUnitKey of spec.scopeUnits ?? []) {
        const orgUnitId = unitIds.get(scopeUnitKey);
        if (!orgUnitId) {
          throw new Error(`User "${spec.key}" references unknown unit "${scopeUnitKey}".`);
        }

        if (APPLY) {
          await db.collection('tbluser_scope_assignments').updateOne(
            {
              tenantId: org.canonicalTenantId,
              organizationId: org.canonicalTenantId,
              userId,
              orgUnitId,
            },
            {
              $set: {
                role: spec.role,
                isCustomRole: false,
                isDeleted: false,
                updatedAt: new Date(),
              },
              $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true }
          );
        }
      }

      // ── Organization membership ──
      if (APPLY) {
        const orgFilter = ObjectId.isValid(org.objectId)
          ? { _id: new ObjectId(org.objectId) }
          : { slug: org.canonicalTenantId };

        // Remove any stale membership row for this user first, so a role
        // change on re-run replaces rather than duplicates.
        await db
          .collection('tblorganizations')
          .updateOne(orgFilter as never, { $pull: { members: { userId } } } as never);

        await db.collection('tblorganizations').updateOne(
          orgFilter as never,
          {
            $push: {
              members: {
                userId,
                role: spec.role,
                status: 'active',
                joinedAt: new Date(),
              },
            },
          } as never
        );
      }

      credentials.push({
        email,
        password,
        role: spec.role,
        scope: describeScope(spec),
        expectation: spec.expectation,
      });
    }

    // ── 3. Credentials output ────────────────────────────────────────

    console.log('');
    console.log(`${BOLD}${'='.repeat(74)}${RESET}`);
    console.log(`${BOLD}  CREDENTIALS${RESET}`);
    console.log(`${BOLD}${'='.repeat(74)}${RESET}`);
    if (!APPLY) {
      console.log(
        `${YELLOW}  DRY RUN -- these accounts were NOT created and these passwords${RESET}`
      );
      console.log(
        `${YELLOW}  are NOT valid. Re-run with --confirm to provision them.${RESET}`
      );
    } else {
      console.log(
        `${RED}  Shown once. Not recoverable -- only the bcrypt hash is stored.${RESET}`
      );
    }
    console.log('');

    for (const c of credentials) {
      console.log(`  ${CYAN}${c.email}${RESET}`);
      console.log(`    password   ${BOLD}${c.password}${RESET}`);
      console.log(`    role       ${c.role}`);
      console.log(`    scope      ${c.scope}`);
      console.log(`    ${DIM}expect     ${c.expectation}${RESET}`);
      console.log('');
    }

    // Machine-readable copy for a password manager / test harness.
    console.log(`${DIM}--- JSON ---${RESET}`);
    console.log(
      JSON.stringify(
        credentials.map((c) => ({ email: c.email, password: c.password, role: c.role })),
        null,
        2
      )
    );
    console.log('');

    if (!APPLY) {
      console.log(`${YELLOW}Dry run complete. Nothing was written.${RESET}`);
      console.log(`Re-run with ${BOLD}--confirm${RESET} to apply.`);
    } else {
      console.log(`${GREEN}Provisioning applied.${RESET}`);
      console.log('');
      console.log(`${BOLD}Next:${RESET}`);
      console.log('  npm run tenancy:backfill              # assign orgUnitId to existing rows (dry run)');
      console.log('  npm run tenancy:backfill -- --confirm # commit the backfill');
      console.log('  npm run tenancy:report                # verify what each account will see');
    }
    console.log('');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('');
  console.error(`${RED}Provisioning failed:${RESET}`, error instanceof Error ? error.message : error);
  console.error('');
  process.exit(1);
});
