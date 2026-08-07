// scripts/repair-scope-assignments.ts
//
// Creates the missing tbluser_scope_assignments rows so provisioned
// accounts can see their scoped data, and repairs assignments that point
// at an unusable org unit.
//
// ---------------------------------------------------------------------
// Where the correct answer comes from
// ---------------------------------------------------------------------
// NOT a hardcoded email->unit table. The organization document already
// records the right unit for these accounts:
//
//   tblorganizations.members[] = { userId, email, role, orgUnitId }
//
// The earlier seed script wrote members[].orgUnitId but never created the
// matching tbluser_scope_assignments row, and resolveContext() reads the
// assignment collection -- so the intent was recorded in one store and
// the enforcement read from the other. This script closes that gap by
// deriving assignments from the membership roster, which means it stays
// correct if units are renamed and needs no editing when accounts are
// added.
//
// A hardcoded table was the alternative. It would have baked today's
// ObjectIds into source, gone stale the first time anyone re-seeded, and
// silently written wrong assignments rather than failing.
//
// ---------------------------------------------------------------------
// Unusable-unit remapping
// ---------------------------------------------------------------------
// Two accounts point at the legacy 'HARARE' branch
// (6a648ca59638311a60b175a8). That unit is a top-level branch with no
// children and, critically, no child lists it in their `path`, so it
// expands to +0 descendants and matches nothing. Assignments to such a
// unit are silently useless. They are remapped onto the real branch.
//
// Usage:
//   npm run tenancy:repair-scopes                     # dry run
//   npm run tenancy:repair-scopes -- --confirm        # write
//   npm run tenancy:repair-scopes -- --confirm --delete-unfixable
//   npm run tenancy:repair-scopes -- --confirm --distribute

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
const DELETE_UNFIXABLE = argv.includes('--delete-unfixable');
const DISTRIBUTE = argv.includes('--distribute');

/**
 * Accounts that must stay fail-closed. `unassigned@` is the isolation
 * control -- if it ever gains an assignment the whole test matrix stops
 * proving anything -- and the three human accounts are real people whose
 * access is a decision for an administrator, not for a repair script.
 */
const LEAVE_FAIL_CLOSED = new Set([
  'unassigned@willsgrove.test',
  'accounts@willsgrove.co.zw',
  'pastor@gmail.com',
  'fred@gmail.com',
]);

/** Org units that exist but cannot resolve to anything useful. */
const UNUSABLE_UNIT_NAMES = new Set(['HARARE']);

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
    const orgs = await db
      .collection('tblorganizations')
      .find({ isDeleted: { $ne: true } })
      .toArray();

    for (const org of orgs) {
      const tenantId =
        (typeof org.tenantId === 'string' && org.tenantId) ||
        (typeof org.slug === 'string' && org.slug) ||
        String(org._id);

      console.log('');
      console.log(`${BOLD}${org.name}${RESET} ${DIM}${tenantId}${RESET}`);
      console.log(
        `  Mode: ${APPLY ? `${GREEN}APPLY${RESET}` : `${YELLOW}DRY RUN${RESET}`}`
      );
      console.log(`${DIM}${'='.repeat(74)}${RESET}`);

      const units = await db
        .collection('tblorgunits')
        .find({ organizationId: tenantId, isDeleted: { $ne: true } })
        .toArray();
      const unitById = new Map(units.map((u) => [String(u._id), u]));

      // The unit every unusable assignment is remapped onto: the
      // top-level branch that actually has descendants.
      const remapTarget = units.find(
        (u) =>
          u.type === 'branch' &&
          !UNUSABLE_UNIT_NAMES.has(String(u.name)) &&
          units.some((c) => (c.path ?? []).map(String).includes(String(u._id)))
      );

      const accounts = await db.collection('tbladmin').find({ tenantId }).toArray();
      const accountById = new Map(accounts.map((a) => [String(a._id), a]));

      const members: Array<Record<string, unknown>> = Array.isArray(org.members)
        ? (org.members as Array<Record<string, unknown>>)
        : [];
      const memberByUser = new Map(members.map((m) => [String(m.userId ?? ''), m]));

      const existing = await db
        .collection('tbluser_scope_assignments')
        .find({ tenantId, isDeleted: { $ne: true } })
        .toArray();
      const assignedUsers = new Map(existing.map((a) => [String(a.userId), a]));

      let created = 0;
      let remapped = 0;
      const unfixable: Array<{ id: string; email: string }> = [];

      for (const acct of accounts) {
        const userId = String(acct._id);
        const email = String(acct.Email ?? userId).toLowerCase();
        const role = String(acct.Role ?? acct.roles?.[0] ?? 'viewer');

        if (LEAVE_FAIL_CLOSED.has(email)) {
          console.log(`  ${DIM}skip    ${email.padEnd(38)} intentionally fail-closed${RESET}`);
          continue;
        }
        if (['super_admin', 'organization_owner', 'organization_admin'].includes(role)) {
          console.log(`  ${DIM}skip    ${email.padEnd(38)} org-wide by role${RESET}`);
          continue;
        }

        const current = assignedUsers.get(userId);

        // ── Remap an assignment that points at an unusable unit ──
        if (current) {
          const unit = unitById.get(String(current.orgUnitId));
          const unusable =
            !unit ||
            UNUSABLE_UNIT_NAMES.has(String(unit.name)) ||
            (unit.type === 'branch' &&
              !units.some((c) => (c.path ?? []).map(String).includes(String(unit._id))));

          if (unusable && remapTarget) {
            console.log(
              `  ${YELLOW}remap${RESET}   ${email.padEnd(38)} ${unit?.name ?? current.orgUnitId} -> ${remapTarget.name}`
            );
            if (APPLY) {
              await db
                .collection('tbluser_scope_assignments')
                .updateOne(
                  { _id: current._id },
                  { $set: { orgUnitId: String(remapTarget._id), updatedAt: new Date() } }
                );
            }
            remapped += 1;
          } else {
            console.log(`  ${DIM}ok      ${email.padEnd(38)} ${unit?.name ?? '?'}${RESET}`);
          }
          continue;
        }

        // ── Create the missing assignment from the membership roster ──
        const member = memberByUser.get(userId);
        const desired = typeof member?.orgUnitId === 'string' ? member.orgUnitId : undefined;

        if (!desired || !unitById.has(desired)) {
          unfixable.push({ id: userId, email });
          console.log(
            `  ${RED}UNFIXABLE${RESET} ${email.padEnd(37)} no orgUnitId on its member record`
          );
          continue;
        }

        console.log(
          `  ${GREEN}create${RESET}  ${email.padEnd(38)} ${unitById.get(desired)!.name}`
        );
        if (APPLY) {
          // Use upsert so we never crash on a pre‑existing (possibly soft‑deleted) row.
          await db.collection('tbluser_scope_assignments').updateOne(
            {
              organizationId: tenantId,
              userId,
              orgUnitId: desired,
            },
            {
              $set: {
                tenantId,
                role,
                isCustomRole: false,
                assignedBy: 'scripts/repair-scope-assignments',
                updatedAt: new Date(),
                isDeleted: false,
                deletedAt: null,
              },
              $setOnInsert: {
                createdAt: new Date(),
              },
            },
            { upsert: true }
          );
        }
        created += 1;
      }

      console.log('');
      console.log(
        `  ${APPLY ? 'Created' : 'Would create'} ${GREEN}${created}${RESET} assignment(s), ` +
          `remapped ${YELLOW}${remapped}${RESET}, unfixable ${RED}${unfixable.length}${RESET}`
      );

      // ── Optional deletion of unfixable accounts ──
      if (unfixable.length > 0) {
        console.log('');
        if (!DELETE_UNFIXABLE) {
          console.log(
            `${DIM}  These have no org unit recorded anywhere, so there is no correct`
          );
          console.log(
            `${DIM}  assignment to infer. Add --delete-unfixable to remove them, or set`
          );
          console.log(`${DIM}  their unit in the members roster and re-run.${RESET}`);
        } else {
          for (const u of unfixable) {
            console.log(`  ${RED}delete${RESET}  ${u.email}`);
            if (APPLY) {
              await db.collection('tbladmin').deleteOne({ _id: new ObjectId(u.id) });
              await db
                .collection('tblorganizations')
                .updateOne(
                  { _id: org._id },
                  { $pull: { members: { userId: u.id } } } as never
                );
            }
          }
        }
      }

      // ── Optional demo data spread ──
      if (DISTRIBUTE) {
        console.log('');
        console.log(`${BOLD}  Distributing data across units${RESET}`);
        console.log(
          `${DIM}  Every vehicle/fuel/expense currently sits on ONE unit (Harare Heavy`
        );
        console.log(
          `${DIM}  Fleet), which is why a fleet manager scoped to the narrowest unit`
        );
        console.log(
          `${DIM}  sees 100% of the data -- isolation is real but indistinguishable.${RESET}`
        );

        const targets = units.filter((u) => ['fleet', 'workshop'].includes(String(u.type)));
        if (targets.length < 2) {
          console.log(`  ${YELLOW}Need at least two fleet/workshop units to spread across.${RESET}`);
        } else {
          const vehicles = await db
            .collection('tblvehicles')
            .find({ tenantId, isDeleted: { $ne: true } })
            .toArray();

          let moved = 0;
          for (let i = 0; i < vehicles.length; i += 1) {
            const target = targets[i % targets.length];
            const newUnit = String(target._id);
            if (String(vehicles[i].orgUnitId) === newUnit) continue;
            if (APPLY) {
              const plate = vehicles[i].license_plate;
              await db
                .collection('tblvehicles')
                .updateOne({ _id: vehicles[i]._id }, { $set: { orgUnitId: newUnit } });
              // Child rows follow their vehicle, or the pages disagree.
              for (const coll of ['tblfuellogs', 'tblexpenses', 'tbltrips', 'tblreminders']) {
                await db
                  .collection(coll)
                  .updateMany({ tenantId, license_plate: plate }, { $set: { orgUnitId: newUnit } });
              }
            }
            moved += 1;
          }
          console.log(
            `  ${APPLY ? 'Moved' : 'Would move'} ${GREEN}${moved}${RESET} vehicle(s) (and their fuel/expense/trip/reminder rows) across ${targets.length} units`
          );
        }
      }

      console.log('');
      if (!APPLY) {
        console.log(`${YELLOW}  Dry run -- nothing written. Add --confirm.${RESET}`);
      } else {
        console.log(`${GREEN}  Applied.${RESET} Verify with: npm run tenancy:sync-members`);
      }
      console.log('');
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(`${RED}repair-scope-assignments failed:${RESET}`, e instanceof Error ? e.message : e);
  process.exit(1);
});