// scripts/tenancy-rebuild.ts
//
// ONE authoritative rebuild of the tenancy layer. Replaces the piecemeal
// repair scripts as the thing you run to get a correct, demonstrable
// multi-tenant setup.
//
// ---------------------------------------------------------------------
// Why a rebuild rather than more repairs
// ---------------------------------------------------------------------
// The repair scripts worked. Every account now resolves to the org unit
// it should. The remaining problem is not authorization at all -- it is
// that the DATA has nothing to isolate:
//
//   * all 76 vehicles, 1409 fuel logs, 282 expenses, 1 trip and 5
//     reminders sit on ONE unit (Harare Heavy Fleet);
//   * all 77 drivers sit on ONE other unit (Logistics Department);
//   * so fleet.manager -- the NARROWEST scope in the tree -- sees 100%
//     of the fleet, exactly what harare.manager and logistics.manager
//     see, while every Bulawayo and workshop account correctly sees
//     nothing.
//
// Isolation is enforced correctly and is simultaneously impossible to
// observe. No amount of further controller wiring changes that.
//
// Three seed scripts also each built part of the org tree, leaving 17
// units with duplicates (a legacy "HARARE" branch alongside "Harare
// Branch") and, critically, `path` arrays that do not list ancestors --
// which is what made branch assignments expand to +0 descendants.
//
// This script therefore does four things in one transaction-ordered
// pass, each idempotent:
//
//   1. TREE      canonical hierarchy, with correct parentId/path/depth
//   2. PRUNE     soft-delete units outside the canonical set, after
//                migrating anything that points at them
//   3. DATA      spread vehicles and drivers across leaf units, with
//                child rows following their parent
//   4. ACCESS    rebuild scope assignments and the members roster from
//                one declarative table, so the two stores agree
//
// Then it prints the visibility matrix so you can see isolation before
// opening the app.
//
// Usage:
//   npm run tenancy:rebuild                # dry run, prints the plan
//   npm run tenancy:rebuild -- --confirm   # apply
//   npm run tenancy:rebuild -- --confirm --keep-data-layout
//                                          # rebuild tree/access only,
//                                          # leave orgUnitId assignments
//                                          # on business rows untouched

/* eslint-disable no-console */

import { MongoClient, Db, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--confirm');
const KEEP_DATA_LAYOUT = argv.includes('--keep-data-layout');

// ── 1. The canonical tree ────────────────────────────────────────────
//
// Parents first. `key` is internal; `name` is matched against existing
// units so a re-run adopts what is already there instead of duplicating.

type UnitType = 'branch' | 'department' | 'workshop' | 'fleet';

interface UnitSpec {
  key: string;
  type: UnitType;
  name: string;
  code: string;
  parent?: string;
  /** Relative share of vehicles allocated to this unit. Leaves only. */
  weight?: number;
}

const TREE: UnitSpec[] = [
  { key: 'hre', type: 'branch', name: 'Harare Branch', code: 'HRE' },
  { key: 'byo', type: 'branch', name: 'Bulawayo Branch', code: 'BYO' },

  { key: 'hre-log', type: 'department', name: 'Logistics Department', code: 'HRE-LOG', parent: 'hre' },
  { key: 'hre-mtc', type: 'department', name: 'Maintenance Department', code: 'HRE-MTC', parent: 'hre' },
  { key: 'byo-ops', type: 'department', name: 'Bulawayo Operations', code: 'BYO-OPS', parent: 'byo' },

  { key: 'hre-ws', type: 'workshop', name: 'Harare Central Workshop', code: 'HRE-WS', parent: 'hre-mtc' },
  // Weighted: a workshop legitimately holds vehicles that are in for
  // service. Without this, bulawayo.mechanic resolves correctly and still
  // sees nothing, which is indistinguishable from a broken assignment.
  { key: 'byo-ws', type: 'workshop', name: 'Bulawayo Workshop', code: 'BYO-WS', parent: 'byo', weight: 4 },

  { key: 'hre-heavy', type: 'fleet', name: 'Harare Heavy Fleet', code: 'HRE-HVY', parent: 'hre-log', weight: 30 },
  { key: 'hre-light', type: 'fleet', name: 'Harare Light Fleet', code: 'HRE-LGT', parent: 'hre-log', weight: 20 },
  { key: 'hre-loan', type: 'fleet', name: 'Workshop Loan Fleet', code: 'HRE-LOAN', parent: 'hre-ws', weight: 6 },
  { key: 'byo-fleet', type: 'fleet', name: 'Bulawayo Fleet', code: 'BYO-FLT', parent: 'byo-ops', weight: 16 },
];

// ── 4. Who sees what ─────────────────────────────────────────────────
//
// One table. Both tbluser_scope_assignments AND
// tblorganizations.members[].orgUnitId are written from it, because the
// two stores disagreeing is what caused every previous round of this
// bug: one seed wrote the roster and no assignment (users saw nothing),
// another wrote the assignment and no roster entry.
//
// `null` = organization-wide by role (never gets an assignment row).
// Absent from this table = deliberately fail-closed.

const ACCESS: Array<{ email: string; unit: string | null }> = [
  { email: 'owner@willsgrove.test', unit: null },
  { email: 'admin@willsgrove.test', unit: null },
  { email: 'fredtinotenda3@gmail.com', unit: null },

  { email: 'harare.manager@willsgrove.test', unit: 'hre' },
  { email: 'harare.dispatcher@willsgrove.test', unit: 'hre' },
  { email: 'harare.accountant@willsgrove.test', unit: 'hre' },
  { email: 'harare.auditor@willsgrove.test', unit: 'hre' },
  { email: 'stanley@gmail.com', unit: 'hre' },
  { email: 'aryes@gmail.com', unit: 'hre' },

  { email: 'logistics.manager@willsgrove.test', unit: 'hre-log' },
  { email: 'fleet.manager@willsgrove.test', unit: 'hre-heavy' },
  { email: 'driver@willsgrove.test', unit: 'hre-heavy' },
  { email: 'harare.driver@willsgrove.test', unit: 'hre-light' },
  { email: 'fleetmanager@willsgrove.test', unit: 'hre-light' },

  { email: 'workshop.manager@willsgrove.test', unit: 'hre-ws' },
  { email: 'mechanic@willsgrove.test', unit: 'hre-ws' },
  { email: 'harare.mechanic@willsgrove.test', unit: 'hre-ws' },

  { email: 'bulawayo.manager@willsgrove.test', unit: 'byo' },
  { email: 'bulawayo.dispatcher@willsgrove.test', unit: 'byo' },
  { email: 'bulawayo.viewer@willsgrove.test', unit: 'byo' },
  { email: 'bulawayo.mechanic@willsgrove.test', unit: 'byo-ws' },

  // Both branches: org-wide reach for roles that are NOT in
  // FULL_ORG_UNIT_VISIBILITY_ROLES and so cannot get it from their role.
  { email: 'accountant@willsgrove.test', unit: 'hre+byo' },
  { email: 'auditor@willsgrove.test', unit: 'hre+byo' },

  // Deliberately absent, and it matters:
  //   unassigned@willsgrove.test  -- the fail-closed control
  //   accounts@willsgrove.co.zw, pastor@, fred@  -- real people
];

const CHILD_COLLECTIONS_BY_PLATE = [
  'tblfuellogs',
  'tblexpenses',
  'tbltrips',
  'tblreminders',
];

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
    const org = await db
      .collection('tblorganizations')
      .findOne({ isDeleted: { $ne: true } });
    if (!org) throw new Error('No organization found.');

    const tenantId =
      (typeof org.tenantId === 'string' && org.tenantId) ||
      (typeof org.slug === 'string' && org.slug) ||
      String(org._id);

    console.log('');
    console.log(`${BOLD}Tenancy rebuild${RESET}`);
    console.log(`  ${org.name}  ${DIM}${tenantId}${RESET}`);
    console.log(`  Mode: ${APPLY ? `${GREEN}APPLY${RESET}` : `${YELLOW}DRY RUN${RESET}`}`);
    console.log(`${DIM}${'='.repeat(74)}${RESET}`);

    // ── STEP 1: canonical tree ───────────────────────────────────────
    console.log('');
    console.log(`${BOLD}1. Hierarchy${RESET}`);

    const existingUnits = await db
      .collection('tblorgunits')
      .find({ organizationId: tenantId })
      .toArray();

    const idOf = new Map<string, string>();
    const pathOf = new Map<string, string[]>();
    const canonicalIds = new Set<string>();

    for (const spec of TREE) {
      const parentId = spec.parent ? idOf.get(spec.parent)! : null;
      const parentPath = spec.parent ? pathOf.get(spec.parent)! : [];
      // The materialized ancestor chain, root-first, EXCLUDING self.
      // Getting this wrong is what broke descendant expansion: a branch
      // whose children do not list it here resolves to +0 descendants
      // and its manager sees an empty application.
      const path = parentId ? [...parentPath, parentId] : [];

      const match = existingUnits.find(
        (u) => String(u.name) === spec.name && String(u.type) === spec.type
      );

      const doc = {
        tenantId,
        organizationId: tenantId,
        type: spec.type,
        name: spec.name,
        code: spec.code,
        parentId,
        path,
        depth: path.length,
        status: 'active',
        isDeleted: false,
        updatedAt: new Date(),
      };

      let id: string;
      if (match) {
        id = String(match._id);
        const pathWrong = JSON.stringify((match.path ?? []).map(String)) !== JSON.stringify(path);
        const revived = match.isDeleted === true;
        if (APPLY) {
          await db.collection('tblorgunits').updateOne({ _id: match._id }, { $set: doc });
        }
        console.log(
          `  ${pathWrong || revived ? YELLOW + 'repair' + RESET : DIM + 'ok    ' + RESET}  ` +
            `${'  '.repeat(path.length)}${spec.type.padEnd(11)} ${spec.name}` +
            (pathWrong ? `  ${YELLOW}(path was wrong -- this is why scope expanded to nothing)${RESET}` : '')
        );
      } else {
        if (APPLY) {
          const res = await db
            .collection('tblorgunits')
            .insertOne({ ...doc, createdAt: new Date() } as never);
          id = String(res.insertedId);
        } else {
          id = `dry-${spec.key}`;
        }
        console.log(
          `  ${GREEN}create${RESET}  ${'  '.repeat(path.length)}${spec.type.padEnd(11)} ${spec.name}`
        );
      }
      idOf.set(spec.key, id);
      pathOf.set(spec.key, path);
      canonicalIds.add(id);
    }

    // ── STEP 2: prune ────────────────────────────────────────────────
    console.log('');
    console.log(`${BOLD}2. Prune non-canonical units${RESET}`);

    const strays = existingUnits.filter(
      (u) => !canonicalIds.has(String(u._id)) && u.isDeleted !== true
    );
    const harareId = idOf.get('hre')!;

    for (const u of strays) {
      const strayId = String(u._id);
      // Anything still pointing at a stray is migrated to Harare Branch
      // rather than orphaned -- an orphaned row is invisible to every
      // scoped user, which reads as data loss.
      console.log(`  ${RED}remove${RESET}  ${String(u.type).padEnd(11)} ${u.name} ${DIM}${strayId}${RESET}`);
      if (APPLY) {
        for (const coll of ['tblvehicles', 'tbldrivers', ...CHILD_COLLECTIONS_BY_PLATE]) {
          await db
            .collection(coll)
            .updateMany({ tenantId, orgUnitId: strayId }, { $set: { orgUnitId: harareId } });
        }
        await db
          .collection('tbluser_scope_assignments')
          .updateMany({ tenantId, orgUnitId: strayId }, { $set: { orgUnitId: harareId } });
        await db
          .collection('tblorgunits')
          .updateOne(
            { _id: u._id },
            { $set: { isDeleted: true, deletedAt: new Date(), status: 'archived' } }
          );
      }
    }
    if (strays.length === 0) console.log(`  ${DIM}nothing to prune${RESET}`);

    // ── STEP 3: distribute data ──────────────────────────────────────
    console.log('');
    console.log(`${BOLD}3. Data distribution${RESET}`);

    if (KEEP_DATA_LAYOUT) {
      console.log(`  ${DIM}--keep-data-layout: leaving orgUnitId on business rows untouched${RESET}`);
    } else {
      const leaves = TREE.filter((s) => s.weight);
      const vehicles = await db
        .collection('tblvehicles')
        .find({ tenantId, isDeleted: { $ne: true } })
        .sort({ license_plate: 1 })
        .toArray();

      // Weighted round-robin, deterministic on plate order so a re-run
      // produces the same layout rather than reshuffling the demo.
      const slots: string[] = [];
      for (const leaf of leaves) {
        for (let i = 0; i < (leaf.weight ?? 0); i += 1) slots.push(leaf.key);
      }

      const perUnit = new Map<string, number>();
      for (let i = 0; i < vehicles.length; i += 1) {
        const key = slots[i % slots.length];
        const unitId = idOf.get(key)!;
        perUnit.set(key, (perUnit.get(key) ?? 0) + 1);
        if (APPLY) {
          await db
            .collection('tblvehicles')
            .updateOne({ _id: vehicles[i]._id }, { $set: { orgUnitId: unitId } });
          // Child rows follow their vehicle. If they do not, the
          // Vehicles page and the Fuel page disagree about scope for the
          // same physical truck.
          const plate = vehicles[i].license_plate;
          if (plate) {
            for (const coll of CHILD_COLLECTIONS_BY_PLATE) {
              await db
                .collection(coll)
                .updateMany({ tenantId, license_plate: plate }, { $set: { orgUnitId: unitId } });
            }
          }
        }
      }
      for (const [key, n] of perUnit) {
        console.log(`  ${TREE.find((t) => t.key === key)!.name.padEnd(28)} ${String(n).padStart(4)} vehicles (+ their fuel/expense/trip/reminder rows)`);
      }

      // Drivers spread across the same leaves so a fleet manager sees
      // the drivers of their own fleet, not zero.
      const drivers = await db
        .collection('tbldrivers')
        .find({ tenantId, isDeleted: { $ne: true } })
        .sort({ name: 1 })
        .toArray();
      for (let i = 0; i < drivers.length; i += 1) {
        if (!APPLY) break;
        const unitId = idOf.get(slots[i % slots.length])!;
        await db.collection('tbldrivers').updateOne({ _id: drivers[i]._id }, { $set: { orgUnitId: unitId } });
      }
      console.log(`  ${DIM}${drivers.length} drivers spread across the same leaf units${RESET}`);
    }

    // ── STEP 4: access ───────────────────────────────────────────────
    console.log('');
    console.log(`${BOLD}4. Access (assignments + roster, written together)${RESET}`);

    const accounts = await db.collection('tbladmin').find({ tenantId }).toArray();
    const byEmail = new Map(
      accounts.map((a) => [String(a.Email ?? '').toLowerCase(), a])
    );

    if (APPLY) {
      // Rebuilt from scratch: stale rows pointing at pruned units are the
      // reason a "correct" assignment could still resolve to nothing.
      await db.collection('tbluser_scope_assignments').deleteMany({ tenantId });
    }

    const members: Array<Record<string, unknown>> = [];

    for (const entry of ACCESS) {
      const acct = byEmail.get(entry.email);
      if (!acct) {
        console.log(`  ${YELLOW}skip${RESET}    ${entry.email.padEnd(38)} no such account`);
        continue;
      }
      const userId = String(acct._id);
      const role = String(acct.Role ?? acct.roles?.[0] ?? 'viewer');

      if (entry.unit === null) {
        console.log(`  ${DIM}org-wide${RESET} ${entry.email.padEnd(37)} by role (${role})`);
        members.push({ userId, email: entry.email, role, status: 'active', joinedAt: new Date() });
        continue;
      }

      const keys = entry.unit === 'hre+byo' ? ['hre', 'byo'] : [entry.unit];
      const unitIds = keys.map((k) => idOf.get(k)!);

      for (const unitId of unitIds) {
        if (APPLY) {
          await db.collection('tbluser_scope_assignments').insertOne({
            tenantId,
            organizationId: tenantId,
            userId,
            orgUnitId: unitId,
            role,
            isCustomRole: false,
            assignedBy: 'scripts/tenancy-rebuild',
            createdAt: new Date(),
            updatedAt: new Date(),
            isDeleted: false,
            deletedAt: null,
          } as never);
        }
      }

      members.push({
        userId,
        email: entry.email,
        role,
        status: 'active',
        joinedAt: new Date(),
        orgUnitId: unitIds[0],
      });

      console.log(
        `  ${GREEN}assign${RESET}  ${entry.email.padEnd(38)} ${keys.map((k) => TREE.find((t) => t.key === k)!.name).join(' + ')}`
      );
    }

    // Accounts absent from ACCESS keep no assignment and no roster unit.
    for (const acct of accounts) {
      const email = String(acct.Email ?? '').toLowerCase();
      if (ACCESS.some((e) => e.email === email)) continue;
      console.log(`  ${DIM}closed${RESET}  ${email.padEnd(38)} intentionally no scope`);
      members.push({
        userId: String(acct._id),
        email,
        role: String(acct.Role ?? 'viewer'),
        status: 'active',
        joinedAt: new Date(),
      });
    }

    if (APPLY) {
      await db
        .collection('tblorganizations')
        .updateOne({ _id: org._id }, { $set: { members, updatedAt: new Date() } });
    }

    // ── Verification matrix ──────────────────────────────────────────
    console.log('');
    console.log(`${BOLD}Expected visibility${RESET} ${DIM}(re-run tenancy:sync-members after --confirm to confirm)${RESET}`);

    if (!KEEP_DATA_LAYOUT) {
      const total = TREE.filter((t) => t.weight).reduce((s, t) => s + (t.weight ?? 0), 0);
      const share = (keys: string[]): string => {
        const w = TREE.filter(
          (t) => t.weight && (keys.includes(t.key) || keys.some((k) => descendantKeys(k).includes(t.key)))
        ).reduce((s, t) => s + (t.weight ?? 0), 0);
        return `${Math.round((w / total) * 76)}`;
      };
      const rows: Array<[string, string]> = [
        ['owner@ / admin@', '76 (org-wide)'],
        ['harare.manager@', share(['hre'])],
        ['logistics.manager@', share(['hre-log'])],
        ['fleet.manager@ / driver@', share(['hre-heavy'])],
        ['workshop.manager@ / mechanic@', share(['hre-ws'])],
        ['bulawayo.manager@', share(['byo'])],
        ['bulawayo.mechanic@', share(['byo-ws'])],
        ['unassigned@', '0 (fail-closed control)'],
      ];
      for (const [who, n] of rows) {
        console.log(`  ${who.padEnd(32)} ${CYAN}${n}${RESET} vehicles`);
      }
    }

    console.log('');
    if (!APPLY) {
      console.log(`${YELLOW}Dry run -- nothing written. Re-run with --confirm.${RESET}`);
    } else {
      console.log(`${GREEN}Rebuild applied.${RESET}`);
      console.log(`  npm run tenancy:sync-members    # verify the matrix above`);
    }
    console.log('');
  } finally {
    await client.close();
  }
}

/** Keys of every unit beneath `key`, per the static TREE. */
function descendantKeys(key: string): string[] {
  const out: string[] = [];
  const walk = (k: string): void => {
    for (const child of TREE.filter((t) => t.parent === k)) {
      out.push(child.key);
      walk(child.key);
    }
  };
  walk(key);
  return out;
}

main().catch((e) => {
  console.error(`${RED}Rebuild failed:${RESET}`, e instanceof Error ? e.message : e);
  process.exit(1);
});
