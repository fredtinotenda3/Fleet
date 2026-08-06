// scripts/tenancy-report.ts
//
// READ-ONLY. Answers the question you actually want answered before
// handing credentials to someone: "when this person logs in, what will
// they see?"
//
// It resolves the same way the application does -- role, then
// UserScopeAssignment, then descendant expansion -- and then counts the
// rows each resulting scope can reach. It writes nothing, ever.
//
// This exists because the failure mode that matters is silent. A branch
// manager whose org units were never backfilled logs in successfully,
// sees an empty dashboard, and reports "the app is broken". This report
// distinguishes that case ("scoped correctly, but 0 rows carry an
// orgUnitId") from an actual isolation bug ("scoped to Harare, can see
// Bulawayo rows") before a user ever hits it.
//
// Usage:
//   npm run tenancy:report
//   npm run tenancy:report -- --org <slug>

/* eslint-disable no-console */

import { MongoClient, Db } from 'mongodb';
import * as dotenv from 'dotenv';
import {
  MODULE_SCOPE_REGISTRY,
  orgUnitScopedCollections,
  unconfirmedDecisions,
} from '../server/tenancy/module-scope.registry';

dotenv.config();

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const argv = process.argv.slice(2);
/**
 * FIX (blocking): this was
 *   const ORG_ARG = argv[argv.indexOf('--org') + 1];
 * When --org is absent, indexOf returns -1, so the expression evaluates
 * to argv[0] -- i.e. it silently adopts whatever the FIRST argument
 * happens to be as the organization filter. Running
 *   npm run tenancy:backfill -- --confirm
 * therefore aborted with `No organization matches "--confirm"`, because
 * '--confirm' had been read as an org slug. The dry run appeared to work
 * only because it was invoked with no arguments at all.
 *
 * Guarded so a missing flag yields undefined, and a flag with no value
 * after it is a hard error rather than silently consuming the next flag.
 */
function optionValue(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) {
    console.error(`${RED}--${name} requires a value.${RESET}`);
    process.exit(1);
  }
  return next;
}

const ORG_ARG = optionValue('org');

/** Roles that resolve to accessibleOrgUnitIds === null (whole organization). */
const FULL_VISIBILITY = new Set(['super_admin', 'organization_owner', 'organization_admin']);

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(`${RED}MONGODB_URI is not set.${RESET}`);
    process.exit(1);
  }

  const client = new MongoClient(uri, { readPreference: 'secondaryPreferred' });
  await client.connect();
  const db = client.db();

  try {
    const orgs = await db
      .collection('tblorganizations')
      .find({ isDeleted: { $ne: true } })
      .toArray();

    const identify = (o: Record<string, unknown>): string =>
      (typeof o.tenantId === 'string' && o.tenantId.trim()) ||
      (typeof o.slug === 'string' && o.slug.trim()) ||
      String(o._id);

    console.log('');
    console.log(`${BOLD}Tenancy report${RESET}  ${DIM}(read-only)${RESET}`);
    console.log(`${DIM}${'='.repeat(74)}${RESET}`);
    console.log('');

    // ── Organizations ────────────────────────────────────────────────

    console.log(`${BOLD}Organizations (${orgs.length})${RESET}`);
    for (const o of orgs) {
      console.log(`  ${CYAN}${identify(o).padEnd(40)}${RESET} ${o.name ?? ''}  ${DIM}${o.status ?? ''}${RESET}`);
    }
    if (orgs.length > 1) {
      console.log('');
      console.log(
        `  ${YELLOW}More than one organization is present. To reduce to one:${RESET}`
      );
      console.log(`  ${DIM}npm run tenancy:purge -- --keep <tenantId>${RESET}`);
    }
    console.log('');

    const targets = orgs.filter((o) => (ORG_ARG ? identify(o) === ORG_ARG : true));

    for (const org of targets) {
      const tenantId = identify(org);
      console.log(`${BOLD}${'-'.repeat(74)}${RESET}`);
      console.log(`${BOLD}${org.name}${RESET} ${DIM}${tenantId}${RESET}`);
      console.log('');

      // ── Hierarchy ──────────────────────────────────────────────────

      const units = await db
        .collection('tblorgunits')
        .find({ organizationId: tenantId, isDeleted: { $ne: true } })
        .toArray();

      console.log(`${BOLD}  Hierarchy (${units.length} units)${RESET}`);
      if (units.length === 0) {
        console.log(`    ${YELLOW}No org units. Run: npm run tenancy:provision -- --confirm${RESET}`);
      }

      const byId = new Map(units.map((u) => [String(u._id), u]));

      /**
       * FIX: this used to sort by path LENGTH and indent by depth, which
       * is not a tree walk. Units at the same depth were printed as one
       * alphabetical block under whichever unit happened to precede them,
       * so the output showed "Bulawayo Fleet" and "Bulawayo Workshop"
       * indented beneath "Harare Branch". For the tool whose whole job is
       * verifying the hierarchy, drawing the wrong parentage is worse
       * than drawing nothing.
       *
       * Now a real walk over parentId, so indentation is actual nesting.
       */
      const childrenOf = new Map<string, typeof units>();
      const roots: typeof units = [];
      for (const u of units) {
        const parentId = u.parentId ? String(u.parentId) : null;
        if (!parentId) {
          roots.push(u);
          continue;
        }
        if (!byId.has(parentId)) continue; // orphan; reported separately below
        const siblings = childrenOf.get(parentId) ?? [];
        siblings.push(u);
        childrenOf.set(parentId, siblings);
      }

      const byName = (a: (typeof units)[number], b: (typeof units)[number]) =>
        String(a.name).localeCompare(String(b.name));

      const printed = new Set<string>();
      const walk = (unit: (typeof units)[number], depth: number): void => {
        const id = String(unit._id);
        if (printed.has(id)) return; // cycle guard
        printed.add(id);
        console.log(
          `    ${'  '.repeat(depth)}${String(unit.type).padEnd(11)} ${unit.name} ${DIM}${id}${RESET}`
        );
        for (const child of (childrenOf.get(id) ?? []).sort(byName)) {
          walk(child, depth + 1);
        }
      };

      for (const root of [...roots].sort(byName)) walk(root, 0);

      // Anything not reachable from a root: its parent was deleted, or it
      // sits in a cycle. Invisible in the old rendering, which silently
      // printed such units as though they were top-level.
      const orphans = units.filter((u) => !printed.has(String(u._id)));
      if (orphans.length > 0) {
        console.log('');
        console.log(`    ${YELLOW}Unreachable units (parent missing or cyclic):${RESET}`);
        for (const u of orphans) {
          console.log(
            `      ${String(u.type).padEnd(11)} ${u.name} ${DIM}${String(u._id)} parent=${String(u.parentId)}${RESET}`
          );
        }
      }
      console.log('');

      // ── Data distribution ──────────────────────────────────────────

      console.log(`${BOLD}  Backfill status of org-unit-scoped collections${RESET}`);
      let anyUnbackfilled = false;

      for (const collection of orgUnitScopedCollections()) {
        const exists = await db.listCollections({ name: collection }).hasNext();
        if (!exists) continue;

        const total = await db.collection(collection).countDocuments({
          tenantId,
          isDeleted: { $ne: true },
        });
        if (total === 0) continue;

        const withUnit = await db.collection(collection).countDocuments({
          tenantId,
          isDeleted: { $ne: true },
          orgUnitId: { $exists: true, $nin: [null, ''] },
        });

        const pct = Math.round((withUnit / total) * 100);
        const colour = pct === 100 ? GREEN : pct === 0 ? RED : YELLOW;
        if (pct < 100) anyUnbackfilled = true;

        console.log(
          `    ${collection.padEnd(34)} ${String(withUnit).padStart(6)}/${String(total).padEnd(6)} ` +
            `${colour}${String(pct).padStart(3)}% assigned${RESET}`
        );
      }

      if (anyUnbackfilled) {
        console.log('');
        console.log(
          `    ${YELLOW}Rows without an orgUnitId are INVISIBLE to branch/department/${RESET}`
        );
        console.log(
          `    ${YELLOW}workshop/fleet managers, and visible to org-wide roles.${RESET}`
        );
        console.log(`    ${DIM}Fix: npm run tenancy:backfill -- --confirm${RESET}`);
      }
      console.log('');

      // ── Accounts and their effective scope ─────────────────────────

      const accounts = await db.collection('tbladmin').find({ tenantId }).toArray();

      console.log(`${BOLD}  Accounts (${accounts.length}) and effective visibility${RESET}`);

      for (const account of accounts) {
        const role = String(account.Role ?? 'viewer');
        const userId = String(account._id);

        let scopeLabel: string;
        let accessibleIds: string[] | null;

        if (FULL_VISIBILITY.has(role)) {
          accessibleIds = null;
          scopeLabel = `${GREEN}organization-wide${RESET}`;
        } else {
          const assignments = await db
            .collection('tbluser_scope_assignments')
            .find({ organizationId: tenantId, userId, isDeleted: { $ne: true } })
            .toArray();

          const roots = assignments.map((a) => String(a.orgUnitId));
          const expanded = new Set(roots);
          for (const u of units) {
            if (u.path?.some((p: string) => roots.includes(p))) {
              expanded.add(String(u._id));
            }
          }
          accessibleIds = Array.from(expanded);

          if (accessibleIds.length === 0) {
            scopeLabel = `${RED}NOTHING (no scope assignment)${RESET}`;
          } else {
            const names = roots.map((r) => byId.get(r)?.name ?? r);
            scopeLabel = `${names.join(', ')} ${DIM}(+${accessibleIds.length - roots.length} descendants)${RESET}`;
          }
        }

        // What they'd see in the headline collection.
        const vehicleFilter: Record<string, unknown> = {
          tenantId,
          isDeleted: { $ne: true },
        };
        if (accessibleIds !== null) {
          vehicleFilter.orgUnitId = { $in: accessibleIds };
        }
        const visibleVehicles = await db.collection('tblvehicles').countDocuments(vehicleFilter);

        console.log('');
        console.log(`    ${CYAN}${account.Email}${RESET}`);
        console.log(`      role     ${role}`);
        console.log(`      scope    ${scopeLabel}`);
        console.log(
          `      vehicles ${visibleVehicles === 0 ? YELLOW : GREEN}${visibleVehicles}${RESET} visible`
        );

        if (visibleVehicles === 0 && accessibleIds !== null && accessibleIds.length > 0) {
          console.log(
            `      ${YELLOW}^ scoped correctly but sees nothing -- the vehicles in these units${RESET}`
          );
          console.log(
            `      ${YELLOW}  have no orgUnitId yet. This is a backfill gap, not a bug.${RESET}`
          );
        }
      }
      console.log('');
    }

    // ── Open decisions ───────────────────────────────────────────────

    const open = unconfirmedDecisions();
    if (open.length > 0) {
      console.log(`${BOLD}${'-'.repeat(74)}${RESET}`);
      console.log(`${BOLD}Scope decisions awaiting product sign-off (${open.length})${RESET}`);
      console.log('');
      for (const entry of open) {
        const marker = entry.level === 'org-unit' ? `${YELLOW}SCOPED${RESET}` : `${CYAN}SHARED${RESET}`;
        console.log(`  ${marker}  ${BOLD}${entry.module}${RESET}`);
        console.log(`          ${DIM}${entry.rationale}${RESET}`);
        console.log('');
      }
      console.log(
        `  ${DIM}Confirm or flip each in server/tenancy/module-scope.registry.ts,${RESET}`
      );
      console.log(`  ${DIM}then update the expected list in the conformance spec.${RESET}`);
      console.log('');
    }

    const scopedCount = MODULE_SCOPE_REGISTRY.filter((e) => e.level === 'org-unit').length;
    console.log(
      `${DIM}${scopedCount} of ${MODULE_SCOPE_REGISTRY.length} modules are org-unit scoped.${RESET}`
    );
    console.log('');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`${RED}Report failed:${RESET}`, error instanceof Error ? error.message : error);
  process.exit(1);
});
