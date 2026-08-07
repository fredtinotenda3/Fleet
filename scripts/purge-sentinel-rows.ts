// scripts/purge-sentinel-rows.ts
//
// Cleans up rows still carrying the legacy `tenantId: "default"`
// sentinel: ~4,037 refresh tokens, ~458 sessions, ~155 digital twins,
// and audit-log entries.
//
// ---------------------------------------------------------------------
// Why these are not all the same problem
// ---------------------------------------------------------------------
// "Reassign them to the right tenant" is the wrong instruction for most
// of this data, so the script treats each collection according to what
// the rows actually are:
//
//   EXPIRE  tblrefreshtokens, tblusersessions
//           Credentials, not business data. A refresh token issued in
//           July under a sentinel tenant should not be repaired and
//           handed a valid tenant -- that would resurrect ~4,500
//           credentials whose tenant binding was never verified. They
//           are revoked. Users re-authenticate; nothing is lost.
//
//   DERIVE  tblvehicledigitaltwins
//           A twin is a rebuildable PROJECTION of a vehicle, so its
//           tenant is whatever its vehicle's tenant is -- derived, never
//           guessed. A twin whose vehicleId no longer resolves is
//           deleted rather than assigned: it projects a vehicle that
//           does not exist.
//
//   LEAVE   tblauditlog
//           Deliberately untouched, and this is the important one. The
//           audit log is hash-chained (`prevHash` -> `hash`). Rewriting
//           any field breaks the chain and destroys the tamper-evidence
//           the log exists to provide. A sentinel tenantId on a
//           historical entry is an accurate record of how the system
//           behaved at the time. Falsifying history to tidy a field is
//           strictly worse than leaving an ugly one. Reported, never
//           written.
//
// Safety: dry run by default; --confirm to write; per-collection opt-out.
//
// Usage:
//   npm run db:purge-sentinels
//   npm run db:purge-sentinels -- --confirm
//   npm run db:purge-sentinels -- --confirm --skip-credentials

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

if (argv.includes('\\')) {
  console.error(`${RED}Refusing to run: literal "\\" argument (Windows CMD continuation).${RESET}`);
  process.exit(1);
}

const APPLY = argv.includes('--confirm');
const SKIP_CREDENTIALS = argv.includes('--skip-credentials');
const SKIP_TWINS = argv.includes('--skip-twins');

/** Every value that has ever meant "no real tenant" in this codebase. */
const SENTINELS = ['default', 'system', '', null];

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
    console.log('');
    console.log(`${BOLD}Legacy sentinel cleanup${RESET}`);
    console.log(`  Mode: ${APPLY ? `${GREEN}APPLY${RESET}` : `${YELLOW}DRY RUN${RESET}`}`);
    console.log(`${DIM}${'='.repeat(74)}${RESET}`);

    const sentinelFilter = { tenantId: { $in: SENTINELS } };

    // ── 1. Credentials: revoke, never repair ─────────────────────────
    console.log('');
    console.log(`${BOLD}1. Credentials (revoke)${RESET}`);

    if (SKIP_CREDENTIALS) {
      console.log(`  ${DIM}skipped via --skip-credentials${RESET}`);
    } else {
      for (const [name, statusField] of [
        ['tblrefreshtokens', 'status'],
        ['tblusersessions', 'status'],
      ] as const) {
        const exists = await db.listCollections({ name }).hasNext();
        if (!exists) continue;

        const total = await db.collection(name).countDocuments(sentinelFilter);
        const live = await db
          .collection(name)
          .countDocuments({ ...sentinelFilter, [statusField]: { $nin: ['revoked', 'expired'] } });

        console.log(
          `  ${name.padEnd(22)} ${String(total).padStart(6)} sentinel rows, ${String(live).padStart(5)} still live`
        );

        if (APPLY && live > 0) {
          await db.collection(name).updateMany(
            { ...sentinelFilter, [statusField]: { $nin: ['revoked', 'expired'] } },
            {
              $set: {
                [statusField]: 'revoked',
                revokedAt: new Date(),
                revokedReason: 'Legacy sentinel tenant — cleaned by purge-sentinel-rows',
                updatedAt: new Date(),
              },
            }
          );
        }
      }
      console.log(
        `  ${DIM}Revoked, not reassigned: a credential whose tenant binding was never${RESET}`
      );
      console.log(
        `  ${DIM}verified must not be handed a valid tenant. Users re-authenticate.${RESET}`
      );
    }

    // ── 2. Digital twins: derive from the vehicle ────────────────────
    console.log('');
    console.log(`${BOLD}2. Digital twins (derive from vehicle)${RESET}`);

    if (SKIP_TWINS) {
      console.log(`  ${DIM}skipped via --skip-twins${RESET}`);
    } else if (await db.listCollections({ name: 'tblvehicledigitaltwins' }).hasNext()) {
      const twins = await db.collection('tblvehicledigitaltwins').find(sentinelFilter).toArray();

      let repaired = 0;
      let orphaned = 0;

      for (const twin of twins) {
        const vehicleId = typeof twin.vehicleId === 'string' ? twin.vehicleId : null;
        const vehicle =
          vehicleId && ObjectId.isValid(vehicleId)
            ? await db.collection('tblvehicles').findOne({ _id: new ObjectId(vehicleId) })
            : null;

        if (!vehicle || typeof vehicle.tenantId !== 'string') {
          orphaned += 1;
          if (APPLY) {
            // Projects a vehicle that no longer exists. Deleted rather
            // than assigned -- there is no tenant it truthfully belongs
            // to, and a rebuild regenerates it if the vehicle returns.
            await db.collection('tblvehicledigitaltwins').deleteOne({ _id: twin._id });
          }
          continue;
        }

        repaired += 1;
        if (APPLY) {
          await db.collection('tblvehicledigitaltwins').updateOne(
            { _id: twin._id },
            {
              $set: {
                tenantId: vehicle.tenantId,
                ...(typeof vehicle.orgUnitId === 'string' ? { orgUnitId: vehicle.orgUnitId } : {}),
                updatedAt: new Date(),
              },
            }
          );
        }
      }

      console.log(
        `  ${String(repaired).padStart(6)} ${APPLY ? 'repaired' : 'would repair'} from their vehicle` +
          ` ${DIM}(tenantId + orgUnitId)${RESET}`
      );
      console.log(
        `  ${String(orphaned).padStart(6)} ${APPLY ? 'deleted' : 'would delete'} ` +
          `${YELLOW}(vehicle no longer exists)${RESET}`
      );
    }

    // ── 3. Audit log: report only ────────────────────────────────────
    console.log('');
    console.log(`${BOLD}3. Audit log (report only — never written)${RESET}`);

    if (await db.listCollections({ name: 'tblauditlog' }).hasNext()) {
      const n = await db.collection('tblauditlog').countDocuments(sentinelFilter);
      console.log(`  ${String(n).padStart(6)} entries carry a sentinel tenantId`);
      console.log('');
      console.log(`  ${CYAN}Left untouched deliberately.${RESET}`);
      console.log(
        `  ${DIM}tblauditlog is hash-chained (prevHash -> hash). Rewriting any field${RESET}`
      );
      console.log(
        `  ${DIM}breaks the chain and destroys the tamper-evidence the log exists for.${RESET}`
      );
      console.log(
        `  ${DIM}A sentinel tenantId on a historical entry is an accurate record of${RESET}`
      );
      console.log(
        `  ${DIM}how the system behaved then. Falsifying history to tidy a field is${RESET}`
      );
      console.log(`  ${DIM}worse than leaving an ugly one.${RESET}`);
    }

    // ── 4. Anything else still holding a sentinel ────────────────────
    console.log('');
    console.log(`${BOLD}4. Remaining sentinel rows elsewhere${RESET}`);

    const handled = new Set([
      'tblrefreshtokens',
      'tblusersessions',
      'tblvehicledigitaltwins',
      'tblauditlog',
    ]);
    const collections = await db.listCollections().toArray();
    let others = 0;

    for (const info of collections) {
      if (info.name.startsWith('system.') || handled.has(info.name)) continue;
      const n = await db.collection(info.name).countDocuments(sentinelFilter);
      if (n === 0) continue;
      others += n;
      console.log(`  ${info.name.padEnd(30)} ${String(n).padStart(6)}`);
    }

    if (others === 0) {
      console.log(`  ${GREEN}none${RESET}`);
    } else {
      console.log('');
      console.log(
        `  ${YELLOW}Not touched by this script.${RESET} ${DIM}These are business rows and need${RESET}`
      );
      console.log(
        `  ${DIM}operator-declared ownership: npm run db:assign (audited, reversible).${RESET}`
      );
    }

    console.log('');
    if (!APPLY) {
      console.log(`${YELLOW}Dry run -- nothing written. Re-run with --confirm.${RESET}`);
    } else {
      console.log(`${GREEN}Applied.${RESET}`);
      console.log(`${DIM}Everyone will need to sign in again -- their refresh tokens were revoked.${RESET}`);
    }
    console.log('');
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(`${RED}purge-sentinel-rows failed:${RESET}`, e instanceof Error ? e.message : e);
  process.exit(1);
});
