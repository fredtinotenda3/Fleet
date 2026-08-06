// scripts/backfill-org-units.ts
//
// Assigns `orgUnitId` to existing rows in every collection the module
// scope registry marks 'org-unit'.
//
// ---------------------------------------------------------------------
// Why this is needed, and what happens if it is not run
// ---------------------------------------------------------------------
// `orgUnitId` is optional on every entity, deliberately: adding a
// required field to a live collection would break every existing row.
// The consequence is that an unbackfilled row is INVISIBLE to a
// scope-narrowed user (a branch/department/workshop/fleet manager) while
// remaining visible to org-wide roles, because
// tenantScopeService.buildFilter() emits `{ orgUnitId: { $in: [...] } }`
// and a row with no such field cannot match.
//
// That is the correct fail-closed default -- invisible beats leaked --
// but it is not the desired end state. Until this runs, a branch manager
// logs in to an empty fleet.
//
// ---------------------------------------------------------------------
// Assignment ladders
// ---------------------------------------------------------------------
// Each collection declares in the registry where its orgUnitId comes
// from. This script implements those joins and NOTHING ELSE:
//
//   vehicle       -- join on vehicleId, or license_plate where that is
//                    the only reference the row carries
//   driver        -- join on driverId, falling back to vehicle
//   workshop-bay  -- join on bayId
//   parent-record -- join on the row's own entityType/entityId pair
//   explicit      -- NO JOIN EXISTS. Reported, never guessed.
//
// The 'explicit' case is the important one. A purchase request has no
// vehicle and no driver; inferring its owning branch from, say, the
// creator's scope would be a guess that silently misattributes budget
// ownership. This script REPORTS those rows and assigns nothing. An
// operator resolves them through scripts/assign-tenant.ts, which is the
// audited channel for operator-declared ownership.
//
// Safety:
//   * DRY RUN BY DEFAULT. --confirm to write.
//   * Only ever fills a MISSING orgUnitId. Never moves a row that
//     already has one, so it cannot reassign data between units.
//   * Every write is recorded to tbltenant_repair_audit, matching
//     tenant-data-repair.ts, so scripts/revert-tenant-run.ts can roll a
//     run back.
//
// Usage:
//   npm run tenancy:backfill                        # dry run
//   npm run tenancy:backfill -- --confirm           # commit
//   npm run tenancy:backfill -- --collections a,b   # narrow
//   npm run tenancy:backfill -- --org <slug>        # target one org

/* eslint-disable no-console */

import { MongoClient, Db, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import { MODULE_SCOPE_REGISTRY } from '../server/tenancy/module-scope.registry';

dotenv.config();

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const argv = process.argv.slice(2);

if (argv.includes('\\')) {
  console.error(
    `${RED}Refusing to run: a literal "\\" was passed as an argument.${RESET}\n` +
      'Windows CMD has no "\\" line continuation, so later flags were dropped.'
  );
  process.exit(1);
}

const APPLY = argv.includes('--confirm');
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
const COLLECTIONS_ARG = optionValue('collections');

const RUN_ID = randomBytes(12).toString('hex');

// ── Which collection joins to what ───────────────────────────────────

interface CollectionPlan {
  collection: string;
  module: string;
  source: string;
}

function buildPlans(): CollectionPlan[] {
  const plans: CollectionPlan[] = [];
  for (const entry of MODULE_SCOPE_REGISTRY) {
    if (entry.level !== 'org-unit') continue;
    for (const collection of entry.collections) {
      plans.push({
        collection,
        module: entry.module,
        source: entry.orgUnitSource ?? 'explicit',
      });
    }
  }
  if (COLLECTIONS_ARG) {
    const wanted = new Set(COLLECTIONS_ARG.split(',').map((s) => s.trim()));
    return plans.filter((p) => wanted.has(p.collection));
  }
  return plans;
}

// ── Lookup indexes ───────────────────────────────────────────────────

interface Lookups {
  vehicleById: Map<string, string>;
  vehicleByPlate: Map<string, string>;
  driverById: Map<string, string>;
  bayById: Map<string, string>;
  /**
   * Parents that EXIST but carry no orgUnitId. Needed to tell
   * "parent-unassigned" (re-run after assigning the parent) apart from
   * "reference-not-found" (a broken reference that needs repair) --
   * otherwise both look identical to the operator.
   */
  vehicleIdsWithoutUnit: Set<string>;
  platesWithoutUnit: Set<string>;
  driverIdsWithoutUnit: Set<string>;
}

async function buildLookups(db: Db, tenantId: string): Promise<Lookups> {
  const vehicleById = new Map<string, string>();
  const vehicleByPlate = new Map<string, string>();
  const driverById = new Map<string, string>();
  const bayById = new Map<string, string>();
  const vehicleIdsWithoutUnit = new Set<string>();
  const platesWithoutUnit = new Set<string>();
  const driverIdsWithoutUnit = new Set<string>();

  const vehicles = await db
    .collection('tblvehicles')
    // FIX: was `find({ tenantId })` with no isDeleted guard, so
    // soft-deleted vehicles seeded the lookup. That is why the run
    // reported "77 vehicles" while tblvehicles holds 76 live rows -- a
    // deleted vehicle was still able to donate its orgUnitId to a child
    // row, quietly resurrecting an assignment from removed data.
    .find(
      { tenantId, isDeleted: { $ne: true } },
      { projection: { orgUnitId: 1, license_plate: 1 } }
    )
    .toArray();

  for (const v of vehicles) {
    const plateKey =
      typeof v.license_plate === 'string' ? v.license_plate.trim().toUpperCase() : undefined;
    if (typeof v.orgUnitId !== 'string' || !v.orgUnitId) {
      vehicleIdsWithoutUnit.add(String(v._id));
      if (plateKey) platesWithoutUnit.add(plateKey);
      continue;
    }
    vehicleById.set(String(v._id), v.orgUnitId);
    if (plateKey) vehicleByPlate.set(plateKey, v.orgUnitId);
  }

  const drivers = await db
    .collection('tbldrivers')
    .find({ tenantId, isDeleted: { $ne: true } }, { projection: { orgUnitId: 1 } })
    .toArray();
  for (const d of drivers) {
    if (typeof d.orgUnitId === 'string' && d.orgUnitId) {
      driverById.set(String(d._id), d.orgUnitId);
    } else {
      driverIdsWithoutUnit.add(String(d._id));
    }
  }

  const bays = await db
    .collection('tblworkshopbays')
    .find({ tenantId, isDeleted: { $ne: true } }, { projection: { orgUnitId: 1 } })
    .toArray();
  for (const b of bays) {
    if (typeof b.orgUnitId === 'string' && b.orgUnitId) {
      bayById.set(String(b._id), b.orgUnitId);
    }
  }

  return {
    vehicleById,
    vehicleByPlate,
    driverById,
    bayById,
    vehicleIdsWithoutUnit,
    platesWithoutUnit,
    driverIdsWithoutUnit,
  };
}

/**
 * Why a row could not be assigned. Reported per collection so an
 * operator knows which action clears it.
 *
 * FIX: the previous version returned a bare `null` for every failure, so
 * the run printed "5 unresolved" and left the operator to guess whether
 * the cards had no vehicle reference, referenced a vehicle that does not
 * exist, or referenced one that itself has no orgUnitId. Those three
 * need three different remedies, and only the last is fixed by re-running
 * the backfill -- which is exactly what the old output told you to do.
 */
export type UnresolvedReason =
  /** The row carries no reference field at all (no vehicleId, no plate). */
  | 'no-reference'
  /** It references something that is not in this tenant's live data. */
  | 'reference-not-found'
  /** The referenced parent exists but has no orgUnitId of its own. */
  | 'parent-unassigned'
  /** The module has no join defined -- an operator must declare ownership. */
  | 'no-join-defined';

const REASON_ADVICE: Record<UnresolvedReason, string> = {
  'no-reference':
    'row has no vehicle/driver reference -- assign the unit directly (npm run db:assign)',
  'reference-not-found':
    'referenced vehicle/driver is missing or deleted -- fix the reference, then re-run',
  'parent-unassigned':
    'referenced parent has no orgUnitId -- assign the parent, then re-run this backfill',
  'no-join-defined':
    "module has no join (source: explicit) -- an operator must declare ownership",
};

interface Resolution {
  orgUnitId: string | null;
  reason?: UnresolvedReason;
  /** A human-recognisable handle for the row, for the sample output. */
  label?: string;
}

/** Resolves the orgUnitId a row should inherit, with a reason when it cannot. */
function resolveOrgUnit(
  row: Record<string, unknown>,
  source: string,
  lookups: Lookups
): Resolution {
  const plateOf = (): string | undefined => {
    const plate = row.license_plate ?? row.licensePlate;
    return typeof plate === 'string' && plate.trim() ? plate.trim() : undefined;
  };

  const byVehicle = (): Resolution => {
    const id = row.vehicleId ?? row.vehicle_id;
    const plate = plateOf();
    const label = plate ?? (typeof id === 'string' ? id : undefined);

    if (typeof id === 'string' && id) {
      const hit = lookups.vehicleById.get(id);
      if (hit) return { orgUnitId: hit, label };
      // The id resolves to nothing live, but a plate may still work.
      if (!plate) {
        return {
          orgUnitId: null,
          reason: lookups.vehicleIdsWithoutUnit.has(id)
            ? 'parent-unassigned'
            : 'reference-not-found',
          label,
        };
      }
    }

    if (plate) {
      const key = plate.toUpperCase();
      const hit = lookups.vehicleByPlate.get(key);
      if (hit) return { orgUnitId: hit, label };
      return {
        orgUnitId: null,
        reason: lookups.platesWithoutUnit.has(key)
          ? 'parent-unassigned'
          : 'reference-not-found',
        label,
      };
    }

    return { orgUnitId: null, reason: 'no-reference', label };
  };

  const byDriver = (): Resolution => {
    const id = row.driverId ?? row.driver_id;
    if (typeof id === 'string' && id) {
      const hit = lookups.driverById.get(id);
      if (hit) return { orgUnitId: hit, label: id };
      return {
        orgUnitId: null,
        reason: lookups.driverIdsWithoutUnit.has(id)
          ? 'parent-unassigned'
          : 'reference-not-found',
        label: id,
      };
    }
    return { orgUnitId: null, reason: 'no-reference', label: undefined };
  };

  switch (source) {
    case 'vehicle':
      return byVehicle();
    case 'driver': {
      // A shift rosters a driver; fall back to the assigned vehicle when
      // the driver has not been assigned to a unit yet.
      const viaDriver = byDriver();
      if (viaDriver.orgUnitId) return viaDriver;
      const viaVehicle = byVehicle();
      if (viaVehicle.orgUnitId) return viaVehicle;
      return viaDriver.reason === 'no-reference' ? viaVehicle : viaDriver;
    }
    case 'workshop-bay': {
      const bayId = row.bayId;
      if (typeof bayId === 'string' && bayId) {
        const hit = lookups.bayById.get(bayId);
        if (hit) return { orgUnitId: hit, label: bayId };
        return { orgUnitId: null, reason: 'reference-not-found', label: bayId };
      }
      return { orgUnitId: null, reason: 'no-reference' };
    }
    case 'parent-record': {
      // Compliance records carry entityType + entityId.
      const entityType = row.entityType;
      const entityId = row.entityId;
      if (typeof entityId !== 'string' || !entityId) {
        return { orgUnitId: null, reason: 'no-reference' };
      }
      const hit =
        entityType === 'vehicle'
          ? lookups.vehicleById.get(entityId)
          : entityType === 'driver'
          ? lookups.driverById.get(entityId)
          : undefined;
      if (hit) return { orgUnitId: hit, label: entityId };
      return { orgUnitId: null, reason: 'reference-not-found', label: entityId };
    }
    case 'explicit':
    default:
      // No join exists. Guessing here would misattribute ownership.
      return { orgUnitId: null, reason: 'no-join-defined' };
  }
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
    const orgs = await db
      .collection('tblorganizations')
      .find({ isDeleted: { $ne: true } })
      .toArray();

    const targets = orgs
      .map((o) => ({
        tenantId:
          (typeof o.tenantId === 'string' && o.tenantId.trim()) ||
          (typeof o.slug === 'string' && o.slug.trim()) ||
          String(o._id),
        name: String(o.name ?? ''),
      }))
      .filter((o) => (ORG_ARG ? o.tenantId === ORG_ARG : true));

    if (targets.length === 0) {
      throw new Error(ORG_ARG ? `No organization matches "${ORG_ARG}".` : 'No organizations found.');
    }

    console.log('');
    console.log(`${BOLD}orgUnitId backfill${RESET}   ${DIM}run ${RUN_ID}${RESET}`);
    console.log(`${DIM}${'='.repeat(74)}${RESET}`);
    console.log(
      `  Mode: ${APPLY ? `${GREEN}APPLY${RESET}` : `${YELLOW}DRY RUN (no writes)${RESET}`}`
    );
    console.log('');

    const plans = buildPlans();
    let totalAssigned = 0;
    let totalUnresolved = 0;
    const unresolvedByCollection = new Map<string, number>();
    const reasonsByCollection = new Map<
      string,
      Map<UnresolvedReason, { count: number; samples: string[] }>
    >();

    for (const target of targets) {
      const lookups = await buildLookups(db, target.tenantId);

      console.log(`${BOLD}${target.name}${RESET} ${DIM}(${target.tenantId})${RESET}`);
      console.log(
        `  ${DIM}reference data: ${lookups.vehicleById.size} vehicles, ` +
          `${lookups.driverById.size} drivers, ${lookups.bayById.size} bays with an org unit${RESET}`
      );

      if (lookups.vehicleById.size === 0 && lookups.driverById.size === 0) {
        console.log(
          `  ${YELLOW}No vehicles or drivers carry an orgUnitId yet.${RESET}\n` +
            `  ${YELLOW}Nothing can be derived until the parents are assigned first.${RESET}\n` +
            `  ${DIM}Assign vehicles/drivers to units in the UI, or via npm run db:assign.${RESET}`
        );
      }

      for (const plan of plans) {
        const collection = db.collection(plan.collection);

        // Only rows MISSING an orgUnitId. A row that already has one is
        // never touched -- this script cannot move data between units.
        const candidates = await collection
          .find({
            tenantId: target.tenantId,
            $or: [{ orgUnitId: { $exists: false } }, { orgUnitId: null }, { orgUnitId: '' }],
          })
          .toArray();

        if (candidates.length === 0) continue;

        let assigned = 0;
        let unresolved = 0;

        for (const row of candidates) {
          const resolution = resolveOrgUnit(
            row as Record<string, unknown>,
            plan.source,
            lookups
          );
          const orgUnitId = resolution.orgUnitId;

          if (!orgUnitId) {
            unresolved += 1;
            const reason = resolution.reason ?? 'no-reference';
            let byReason = reasonsByCollection.get(plan.collection);
            if (!byReason) {
              byReason = new Map();
              reasonsByCollection.set(plan.collection, byReason);
            }
            const bucket = byReason.get(reason) ?? { count: 0, samples: [] };
            bucket.count += 1;
            const label = resolution.label ?? String(row._id);
            if (bucket.samples.length < 5 && !bucket.samples.includes(label)) {
              bucket.samples.push(label);
            }
            byReason.set(reason, bucket);
            continue;
          }

          if (APPLY) {
            await collection.updateOne(
              { _id: row._id },
              { $set: { orgUnitId, updatedAt: new Date() } }
            );
            await db.collection('tbltenant_repair_audit').insertOne({
              runId: RUN_ID,
              script: 'backfill-org-units',
              collection: plan.collection,
              documentId: String(row._id),
              field: 'orgUnitId',
              previousValue: null,
              newValue: orgUnitId,
              ladder: plan.source,
              at: new Date(),
            } as never);
          }
          assigned += 1;
        }

        totalAssigned += assigned;
        totalUnresolved += unresolved;
        if (unresolved > 0) {
          unresolvedByCollection.set(
            plan.collection,
            (unresolvedByCollection.get(plan.collection) ?? 0) + unresolved
          );
        }

        const verb = APPLY ? 'assigned' : 'would assign';
        console.log(
          `    ${plan.collection.padEnd(32)} ${String(assigned).padStart(5)} ${verb}` +
            (unresolved > 0 ? `  ${YELLOW}${unresolved} unresolved${RESET}` : '')
        );
      }
      console.log('');
    }

    // ── Summary ──────────────────────────────────────────────────────

    console.log(`${BOLD}${'='.repeat(74)}${RESET}`);
    console.log(`  ${APPLY ? 'Assigned' : 'Would assign'}: ${GREEN}${totalAssigned}${RESET} rows`);
    console.log(`  Unresolved:  ${totalUnresolved > 0 ? YELLOW : DIM}${totalUnresolved}${RESET} rows`);
    console.log('');

    if (totalUnresolved > 0) {
      console.log(`${YELLOW}Unresolved rows -- NOT guessed, by design:${RESET}`);
      for (const [collection, count] of unresolvedByCollection) {
        const plan = plans.find((p) => p.collection === collection);
        console.log(
          `  ${collection.padEnd(32)} ${String(count).padStart(5)}  ${DIM}(source: ${plan?.source})${RESET}`
        );

        // The actionable part: WHY, and what clears it.
        const byReason = reasonsByCollection.get(collection);
        if (!byReason) continue;
        for (const [reason, bucket] of byReason) {
          console.log(
            `      ${String(bucket.count).padStart(4)} x ${BOLD}${reason}${RESET} ${DIM}-- ${REASON_ADVICE[reason]}${RESET}`
          );
          if (bucket.samples.length > 0) {
            console.log(`           ${DIM}e.g. ${bucket.samples.join(', ')}${RESET}`);
          }
        }
      }
      console.log('');
      console.log(
        `${DIM}  A row is unresolved when its join target has no orgUnitId yet, or${RESET}`
      );
      console.log(
        `${DIM}  when the module has no join at all (source: explicit). Assign the${RESET}`
      );
      console.log(
        `${DIM}  parent vehicles/drivers first and re-run; for 'explicit' sources an${RESET}`
      );
      console.log(
        `${DIM}  operator must declare ownership via: npm run db:assign${RESET}`
      );
      console.log('');
      console.log(
        `${DIM}  These rows stay visible to org-wide roles and hidden from scoped${RESET}`
      );
      console.log(`${DIM}  users until resolved. That is fail-closed, not data loss.${RESET}`);
      console.log('');
    }

    if (!APPLY) {
      console.log(`${YELLOW}Dry run. Nothing was written.${RESET}`);
      console.log(`Re-run with ${BOLD}--confirm${RESET} to apply.`);
    } else {
      console.log(`${GREEN}Backfill applied.${RESET} Run id ${CYAN}${RUN_ID}${RESET}`);
      console.log(`${DIM}Roll back with: npm run db:revert -- --run ${RUN_ID}${RESET}`);
    }
    console.log('');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('');
  console.error(`${RED}Backfill failed:${RESET}`, error instanceof Error ? error.message : error);
  process.exit(1);
});
