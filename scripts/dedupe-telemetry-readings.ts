// scripts/dedupe-telemetry-readings.ts
//
// PHASE 1, F-3 -- prepares tbltelematics for its unique index.
//
// ---------------------------------------------------------------------
// WHY THIS EXISTS
// ---------------------------------------------------------------------
// indexes.telematics-addendum.ts now declares
// `uniq_telematics_tenant_vehicle_device_ts` on
// {tenantId, vehicleId, deviceId, timestamp}. MongoDB refuses to create
// a unique index on a collection that already violates it, so any
// database that ran the pre-Phase-1 code must be swept first.
//
// Duplicates are expected there: bulkUpsertHistoricalReadings upserts on
// that tuple, but an upsert is only atomic against a unique index --
// which is exactly what was missing. Two concurrent backfills over the
// same window could both miss the filter and both insert.
//
// ---------------------------------------------------------------------
// SAFETY
// ---------------------------------------------------------------------
// DRY RUN BY DEFAULT. Reports what it would do and exits. Pass --apply
// to make changes.
//
// Deletion is limited to rows that are duplicates BY THE INDEX KEY --
// same tenant, same vehicle, same device, same instant. Two readings
// with identical values for all four are the same physical fix recorded
// twice; there is no information in the second copy. Nothing else is
// touched: no soft-deleted rows are purged, no old readings are aged
// out (retention is Phase 4), and no row is modified.
//
// WHICH COPY SURVIVES: the one with the lowest _id, i.e. the earliest
// inserted. Deliberately the original rather than the newest, because a
// duplicate produced by a concurrent backfill is a REPLAY of a fix that
// was already stored -- the first insert is the one other records may
// already reference, and keeping it means ingestion order stays
// consistent with _id order for everything downstream.
//
// BEFORE DELETING, the script checks that duplicates are genuinely
// redundant: if two rows sharing the key differ in their measured
// values, it does NOT delete them and reports them for review instead.
// That case should not occur, and if it does it means something other
// than a replay produced them -- which is a question for a human, not
// something to resolve by picking one at random.
//
// IDEMPOTENT: running it twice is safe. The second run finds nothing.
//
// ---------------------------------------------------------------------
// USAGE
// ---------------------------------------------------------------------
//   npx tsx scripts/dedupe-telemetry-readings.ts              # dry run
//   npx tsx scripts/dedupe-telemetry-readings.ts --apply      # execute
//   npx tsx scripts/dedupe-telemetry-readings.ts --tenant X   # one tenant
//
// Then create the index:
//   npm run db:indexes

import 'dotenv/config';
import { MongoClient, Db } from 'mongodb';

const COLLECTION = 'tbltelematics';

interface DuplicateGroup {
  _id: {
    tenantId: string;
    vehicleId: string;
    deviceId: string;
    timestamp: Date;
  };
  count: number;
  ids: unknown[];
  docs: Array<Record<string, unknown>>;
}

/** Fields that carry an actual measurement, for the divergence check. */
const MEASUREMENT_PATHS = [
  'location',
  'engine',
  'trip',
  'fuel',
  'alerts',
] as const;

function measurementSignature(doc: Record<string, unknown>): string {
  const subset: Record<string, unknown> = {};
  for (const path of MEASUREMENT_PATHS) {
    if (doc[path] !== undefined) subset[path] = doc[path];
  }
  // Stable key order so two structurally-identical docs stringify
  // identically regardless of BSON field ordering.
  return JSON.stringify(subset, Object.keys(subset).sort());
}

async function findDuplicateGroups(db: Db, tenantId?: string): Promise<DuplicateGroup[]> {
  const match: Record<string, unknown> = {};
  if (tenantId) match.tenantId = tenantId;

  return db
    .collection(COLLECTION)
    .aggregate<DuplicateGroup>(
      [
        ...(Object.keys(match).length > 0 ? [{ $match: match }] : []),
        {
          $group: {
            _id: {
              tenantId: '$tenantId',
              vehicleId: '$vehicleId',
              deviceId: '$deviceId',
              timestamp: '$timestamp',
            },
            count: { $sum: 1 },
            ids: { $push: '$_id' },
            docs: { $push: '$$ROOT' },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ],
      // The collection can be very large and this aggregation groups
      // across all of it; without disk use it dies on the 100MB
      // in-memory limit exactly on the databases that need it most.
      { allowDiskUse: true }
    )
    .toArray();
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const tenantArg = args.indexOf('--tenant');
  const tenantId = tenantArg > -1 ? args[tenantArg + 1] : undefined;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Refusing to run.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'VehicleExpense');

    console.log(
      `\n[dedupe-telemetry] ${apply ? 'APPLY' : 'DRY RUN'}${tenantId ? ` (tenant: ${tenantId})` : ' (all tenants)'}\n`
    );

    const groups = await findDuplicateGroups(db, tenantId);

    if (groups.length === 0) {
      console.log('No duplicate readings found. The unique index can be created safely.');
      console.log('Next: npm run db:indexes\n');
      return;
    }

    const redundant: DuplicateGroup[] = [];
    const divergent: DuplicateGroup[] = [];

    for (const group of groups) {
      const signatures = new Set(group.docs.map(measurementSignature));
      (signatures.size === 1 ? redundant : divergent).push(group);
    }

    const deletableCount = redundant.reduce((sum, g) => sum + (g.count - 1), 0);

    console.log(`Duplicate key groups found: ${groups.length}`);
    console.log(`  Redundant (identical measurements): ${redundant.length}`);
    console.log(`  Divergent  (differing measurements): ${divergent.length}`);
    console.log(`  Rows that would be deleted:          ${deletableCount}\n`);

    if (divergent.length > 0) {
      console.log(
        'DIVERGENT GROUPS -- NOT TOUCHED. These share an index key but hold different\n' +
          'measurements, so one is not simply a replay of the other. Review before the\n' +
          'unique index can be created:\n'
      );
      for (const g of divergent.slice(0, 25)) {
        console.log(
          `  tenant=${g._id.tenantId} vehicle=${g._id.vehicleId} device=${g._id.deviceId} ` +
            `ts=${new Date(g._id.timestamp).toISOString()} copies=${g.count}`
        );
      }
      if (divergent.length > 25) console.log(`  ... and ${divergent.length - 25} more`);
      console.log('');
    }

    if (!apply) {
      console.log('Dry run complete. Re-run with --apply to delete the redundant copies.\n');
      return;
    }

    let deleted = 0;
    for (const group of redundant) {
      // Keep the lowest _id (earliest inserted); delete the rest.
      const sorted = [...group.ids].sort((a, b) => String(a).localeCompare(String(b)));
      const toDelete = sorted.slice(1);
      if (toDelete.length === 0) continue;

      const result = await db
        .collection(COLLECTION)
        .deleteMany({ _id: { $in: toDelete } } as never);
      deleted += result.deletedCount ?? 0;
    }

    console.log(`Deleted ${deleted} redundant duplicate reading(s).`);

    if (divergent.length > 0) {
      console.log(
        `\n${divergent.length} divergent group(s) remain. The unique index will STILL FAIL\n` +
          'to create until those are resolved by hand.\n'
      );
    } else {
      console.log('\nNo duplicates remain. Next: npm run db:indexes\n');
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('[dedupe-telemetry] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
