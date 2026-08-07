// scripts/sync-member-org-units.ts
//
// Repairs the `members[].orgUnitId` field inside the tblorganizations
// document from the authoritative tbluser_scope_assignments collection,
// and reports the org-unit scope each account actually resolves to.
//
// ---------------------------------------------------------------------
// What this does and does NOT claim
// ---------------------------------------------------------------------
// `TenantContextService.resolveContext()` reads scope from
// tbluser_scope_assignments, NOT from members[].orgUnitId -- I checked
// the code path before writing this. The only other source of an org
// unit at request time is the `x-org-unit-id` header. So a missing
// members[].orgUnitId is NOT by itself the reason a scoped user sees
// zero rows.
//
// It is still worth repairing, for two reasons: the organization
// document is what the members UI renders, so the roster shows people as
// unassigned when they are not; and the two stores silently disagreeing
// is how the next bug gets misdiagnosed.
//
// The genuinely useful part is the SCOPE TRACE below, which replays
// resolveContext()'s exact algorithm per account -- assignments, then
// descendant expansion via the materialized `path`, then a row count in
// each scoped collection. When an account shows zero rows, the trace
// says which step produced the empty set:
//
//   no assignment            -> provisioning gap
//   assignment, empty expand -> the org unit tree's `path` arrays are
//                               wrong (a child does not list its
//                               ancestor), so descendants never match
//   expand ok, zero rows     -> the data genuinely lives in other units
//
// Usage:
//   npm run tenancy:sync-members              # dry run + trace
//   npm run tenancy:sync-members -- --confirm # write members[].orgUnitId

/* eslint-disable no-console */

import { MongoClient, ObjectId } from 'mongodb';
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

const FULL_VISIBILITY = new Set(['super_admin', 'organization_owner', 'organization_admin']);

const SCOPED_COLLECTIONS = [
  'tblvehicles',
  'tbldrivers',
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
      console.log(`${DIM}${'='.repeat(74)}${RESET}`);

      const units = await db
        .collection('tblorgunits')
        .find({ organizationId: tenantId, isDeleted: { $ne: true } })
        .toArray();
      const unitById = new Map(units.map((u) => [String(u._id), u]));

      const assignments = await db
        .collection('tbluser_scope_assignments')
        .find({ tenantId, isDeleted: { $ne: true } })
        .toArray();

      const byUser = new Map<string, string[]>();
      for (const a of assignments) {
        const uid = String(a.userId);
        byUser.set(uid, [...(byUser.get(uid) ?? []), String(a.orgUnitId)]);
      }

      // ── 1. Repair members[].orgUnitId ────────────────────────────────
      const members: Array<Record<string, unknown>> = Array.isArray(org.members)
        ? (org.members as Array<Record<string, unknown>>)
        : [];

      let repaired = 0;
      for (const m of members) {
        const uid = String(m.userId ?? '');
        const roots = byUser.get(uid) ?? [];
        const desired = roots[0];
        if (!desired) continue;
        if (m.orgUnitId === desired) continue;
        m.orgUnitId = desired;
        repaired += 1;
      }

      if (repaired > 0) {
        if (APPLY) {
          await db
            .collection('tblorganizations')
            .updateOne({ _id: org._id }, { $set: { members, updatedAt: new Date() } });
          console.log(`${GREEN}Repaired members[].orgUnitId on ${repaired} member(s).${RESET}`);
        } else {
          console.log(
            `${YELLOW}Would repair members[].orgUnitId on ${repaired} member(s) (--confirm to write).${RESET}`
          );
        }
      } else {
        console.log(`${DIM}members[].orgUnitId already consistent.${RESET}`);
      }

      // ── 2. Scope trace ───────────────────────────────────────────────
      console.log('');
      console.log(`${BOLD}Scope trace${RESET} ${DIM}(replays resolveContext)${RESET}`);

      const accounts = await db.collection('tbladmin').find({ tenantId }).toArray();

      for (const acct of accounts) {
        const uid = String(acct._id);
        const role = String(acct.Role ?? acct.roles?.[0] ?? 'viewer');
        const email = String(acct.Email ?? uid);

        if (FULL_VISIBILITY.has(role)) {
          console.log(`  ${CYAN}${email.padEnd(38)}${RESET} ${GREEN}org-wide by role${RESET}`);
          continue;
        }

        const roots = byUser.get(uid) ?? [];
        if (roots.length === 0) {
          console.log(
            `  ${CYAN}${email.padEnd(38)}${RESET} ${RED}NO ASSIGNMENT${RESET} ${DIM}-> sees zero rows (fail-closed)${RESET}`
          );
          continue;
        }

        // Descendant expansion, exactly as TenantContextService does it:
        // a unit is a descendant of a root when the root id appears in
        // that unit's materialized `path`.
        const expanded = new Set(roots);
        for (const u of units) {
          const path: string[] = Array.isArray(u.path) ? u.path.map(String) : [];
          if (path.some((p) => roots.includes(p))) expanded.add(String(u._id));
        }
        const ids = Array.from(expanded);

        const rootNames = roots.map((r) => unitById.get(r)?.name ?? `${r} (MISSING UNIT)`);
        console.log('');
        console.log(`  ${CYAN}${email}${RESET} ${DIM}${role}${RESET}`);
        console.log(
          `    roots      ${rootNames.join(', ')}  ${DIM}(+${ids.length - roots.length} descendants)${RESET}`
        );

        if (ids.length === roots.length && roots.length > 0) {
          // Not necessarily wrong -- a leaf unit has no descendants --
          // but if a branch expands to nothing, the tree's path arrays
          // are broken and that IS the reason the user sees nothing.
          const anyBranch = roots.some((r) => unitById.get(r)?.type === 'branch');
          if (anyBranch) {
            console.log(
              `    ${YELLOW}WARNING: a branch expanded to no descendants. Child units are not`
            );
            console.log(
              `    ${YELLOW}listing this branch in their 'path' array, so departments,`
            );
            console.log(
              `    ${YELLOW}workshops and fleets beneath it are invisible to this user.${RESET}`
            );
          }
        }

        for (const coll of SCOPED_COLLECTIONS) {
          const exists = await db.listCollections({ name: coll }).hasNext();
          if (!exists) continue;
          const n = await db.collection(coll).countDocuments({
            tenantId,
            isDeleted: { $ne: true },
            orgUnitId: { $in: ids },
          });
          const total = await db
            .collection(coll)
            .countDocuments({ tenantId, isDeleted: { $ne: true } });
          if (total === 0) continue;
          console.log(
            `    ${coll.padEnd(16)} ${String(n).padStart(6)} / ${String(total).padEnd(6)} ${n === 0 ? YELLOW + 'none visible' + RESET : ''}`
          );
        }
      }
      console.log('');
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(`${RED}sync-member-org-units failed:${RESET}`, e instanceof Error ? e.message : e);
  process.exit(1);
});
