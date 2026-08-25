// scripts/backfill-device-provider.ts
//
// PHASE 2 -- fills providerId / externalDeviceId on existing devices.
//
// ---------------------------------------------------------------------
// WHY
// ---------------------------------------------------------------------
// Phase 2 makes provider identity a first-class field on
// TelematicsDevice. Rows written before it carry only the composite
// `deviceId` (`eagletrack-<uin>`, `cartrack-<serial>`, `demo-<vehicleId>`),
// so `provider.resolve.ts` falls back to parsing that prefix.
//
// That fallback is TRANSITIONAL and exists in exactly one place so it
// can be deleted. This script is what makes deleting it possible: once
// every device row carries providerId, nothing needs to parse a device
// id again.
//
// ---------------------------------------------------------------------
// SAFETY
// ---------------------------------------------------------------------
// DRY RUN BY DEFAULT. Reports what it would do and exits. Pass --apply.
//
// * Only ADDS fields. Never renames `deviceId`, never deletes, never
//   touches telemetry readings. The {tenantId, deviceId} unique index
//   and every stored reading are unaffected.
// * Only fills rows where the field is MISSING. A row that already has
//   providerId is left alone, so a partially-completed run resumes
//   safely and a second full run is a no-op.
// * Devices whose id matches NO known prefix are reported and SKIPPED,
//   not guessed. Assigning them a default provider is precisely the
//   defect Phase 2 removes -- an unattributable device must stay
//   unattributed, and `resolveProviderSource` reports it as 'unknown'.
// * Soft-deleted rows are included: they are still read by history
//   queries and reporting, so leaving them unlabelled would leave the
//   prefix fallback load-bearing.
//
// IDEMPOTENT: running it twice is safe; the second run finds nothing.
//
// ---------------------------------------------------------------------
// USAGE
// ---------------------------------------------------------------------
//   npm run db:backfill-device-provider              # dry run
//   npm run db:backfill-device-provider -- --apply   # execute
//   npm run db:backfill-device-provider -- --tenant X

import 'dotenv/config';
import { MongoClient, Db } from 'mongodb';

const COLLECTION = 'tbltelematics_devices';

/**
 * Prefixes this codebase has actually written, in the order they are
 * tested. Deliberately a literal list rather than an import from the
 * registry: a migration must describe the data AS IT WAS WRITTEN, and
 * stay correct even after the registry gains or loses a provider.
 */
const KNOWN_PREFIXES = ['eagletrack', 'cartrack', 'demo'] as const;

interface DeviceRow {
  _id: unknown;
  deviceId?: string;
  providerId?: string;
  externalDeviceId?: string;
}

function classify(deviceId: string): { providerId: string; externalDeviceId: string } | null {
  for (const prefix of KNOWN_PREFIXES) {
    const marker = `${prefix}-`;
    if (deviceId.startsWith(marker)) {
      const external = deviceId.slice(marker.length);
      if (!external) return null;
      return { providerId: prefix, externalDeviceId: external };
    }
  }
  return null;
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
    const db: Db = client.db(process.env.MONGODB_DB || 'VehicleExpense');

    console.log(
      `\n[backfill-device-provider] ${apply ? 'APPLY' : 'DRY RUN'}` +
        `${tenantId ? ` (tenant: ${tenantId})` : ' (all tenants)'}\n`
    );

    const filter: Record<string, unknown> = { providerId: { $exists: false } };
    if (tenantId) filter.tenantId = tenantId;

    const rows = (await db
      .collection(COLLECTION)
      .find(filter)
      .toArray()) as unknown as DeviceRow[];

    if (rows.length === 0) {
      console.log('No devices need backfilling. The prefix fallback is no longer load-bearing.\n');
      return;
    }

    const byProvider = new Map<string, number>();
    const unclassifiable: string[] = [];
    const updates: Array<{ _id: unknown; providerId: string; externalDeviceId: string }> = [];

    for (const row of rows) {
      if (!row.deviceId) {
        unclassifiable.push('(row with no deviceId)');
        continue;
      }
      const classified = classify(row.deviceId);
      if (!classified) {
        unclassifiable.push(row.deviceId);
        continue;
      }
      byProvider.set(classified.providerId, (byProvider.get(classified.providerId) ?? 0) + 1);
      updates.push({ _id: row._id, ...classified });
    }

    console.log(`Devices without providerId: ${rows.length}`);
    for (const [provider, count] of [...byProvider].sort()) {
      console.log(`  ${provider}: ${count}`);
    }
    console.log(`  unclassifiable (SKIPPED, not guessed): ${unclassifiable.length}`);

    if (unclassifiable.length > 0) {
      console.log(
        '\nThese device ids match no known prefix and are left unlabelled ON PURPOSE.\n' +
          "They will report as provider 'unknown' rather than being attributed to a\n" +
          'vendor they may have nothing to do with. Assign them by hand if their\n' +
          'provider is known:\n'
      );
      for (const id of unclassifiable.slice(0, 25)) console.log(`  ${id}`);
      if (unclassifiable.length > 25) console.log(`  ... and ${unclassifiable.length - 25} more`);
    }

    if (!apply) {
      console.log('\nDry run complete. Re-run with --apply to write these fields.\n');
      return;
    }

    let updated = 0;
    for (const update of updates) {
      const result = await db.collection(COLLECTION).updateOne(
        // Guarded on absence so a concurrent run cannot double-write and
        // so re-running never overwrites a value set by hand.
        { _id: update._id as never, providerId: { $exists: false } },
        {
          $set: {
            providerId: update.providerId,
            externalDeviceId: update.externalDeviceId,
            updatedAt: new Date(),
          },
        }
      );
      updated += result.modifiedCount ?? 0;
    }

    console.log(`\nBackfilled ${updated} device(s).`);
    if (unclassifiable.length === 0) {
      console.log(
        'Every device now carries providerId. The transitional prefix fallback in\n' +
          'modules/telematics/providers/provider.resolve.ts can be removed.\n'
      );
    } else {
      console.log(
        `${unclassifiable.length} device(s) remain unlabelled; the prefix fallback is\n` +
          'still required until those are resolved.\n'
      );
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(
    '[backfill-device-provider] Failed:',
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
