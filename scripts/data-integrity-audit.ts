// scripts/data-integrity-audit.ts
//
// Enterprise data-integrity audit & safe-cleanup script.
//
// USAGE:
//   npx tsx scripts/data-integrity-audit.ts                 -> report only, no writes
//   npx tsx scripts/data-integrity-audit.ts --apply          -> apply SAFE fixes only
//   npx tsx scripts/data-integrity-audit.ts --apply --tenant=<id>   -> scope to one tenant
//
// SAFE FIXES (applied only with --apply):
//   1. Recalculate maintenance reminder overdue/pending status (same
//      logic as the fixed getMaintenanceStats -- unresolved + due_date 
//      now => 'overdue').
//   2. Flag (not delete) vehicles with placeholder make/model ("Unknown",
//      "UNKNOWN", "N/A", empty) via a `needsReview: true` + `reviewReason`
//      field, so they surface in the UI without silently vanishing.
//   3. Flag (not delete) expenses / trips / fuel logs / maintenance
//      records whose license_plate does not match any non-deleted
//      vehicle in the same tenant, via the same `needsReview` marker.
//   4. Flag maintenance records whose `title` looks like keyboard-mash
//      test data (short, low vowel ratio, e.g. "JFJF", "dd", "GGG").
//
// NOTHING IS EVER HARD-DELETED OR OVERWRITTEN DESTRUCTIVELY. Every
// mutation this script performs is additive (`needsReview` metadata) or
// a recomputation of a derived field (reminder `status`) from data that
// already exists on the document itself.
import 'dotenv/config';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { Collection, Document } from 'mongodb';

interface AuditIssue {
  category: string;
  collection: string;
  id: string;
  detail: string;
}

interface AuditReport {
  issues: AuditIssue[];
  counts: Record<string, number>;
}

const APPLY = process.argv.includes('--apply');
const TENANT_ARG = process.argv.find((a) => a.startsWith('--tenant='));
const SCOPE_TENANT = TENANT_ARG ? TENANT_ARG.split('=')[1] : undefined;

function tenantFilter(): Record<string, unknown> {
  return SCOPE_TENANT ? { tenantId: SCOPE_TENANT } : {};
}

const PLACEHOLDER_VALUES = new Set(['unknown', 'n/a', 'na', '', 'null', 'undefined', '-']);

function isPlaceholder(value: unknown): boolean {
  if (value == null) return true;
  const normalized = String(value).trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized);
}

/**
 * Heuristic only -- flags candidates for HUMAN review, never auto-deletes.
 * Short strings with an implausibly low vowel ratio and no spaces look
 * like keyboard mashing ("JFJF", "dd", "GGG") rather than a real service
 * description ("Front brake pad replacement").
 */
function looksLikeMashedInput(title: string | undefined | null): boolean {
  if (!title) return false;
  const trimmed = title.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length > 12) return false; // real titles are usually longer
  if (/\s/.test(trimmed)) return false; // multi-word strings are almost never mash
  const letters = trimmed.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return false;
  const vowels = (letters.match(/[aeiouAEIOU]/g) || []).length;
  const vowelRatio = vowels / letters.length;
  return vowelRatio < 0.15; // e.g. "JFJF" -> 0 vowels, "GGG" -> 0 vowels
}

async function markNeedsReview(
  collection: Collection<Document>,
  id: unknown,
  reason: string
): Promise<void> {
  if (!APPLY) return;
  await collection.updateOne(
    { _id: id as any },
    { $set: { needsReview: true, reviewReason: reason, reviewFlaggedAt: new Date() } }
  );
}

async function auditVehicles(db: Awaited<ReturnType<typeof connectToDatabase>>, report: AuditReport) {
  const collection = db.collection('tblvehicles');
  const cursor = collection.find({ isDeleted: { $ne: true }, ...tenantFilter() });

  let placeholderCount = 0;
  for await (const vehicle of cursor) {
    const reasons: string[] = [];
    if (isPlaceholder(vehicle.make)) reasons.push('placeholder make');
    if (isPlaceholder(vehicle.model)) reasons.push('placeholder model');
    if (vehicle.odometer == null || vehicle.odometer === 0) reasons.push('missing/zero odometer');

    if (reasons.length > 0) {
      placeholderCount += 1;
      report.issues.push({
        category: 'vehicle_placeholder_data',
        collection: 'tblvehicles',
        id: String(vehicle._id),
        detail: `${vehicle.license_plate || '(no plate)'}: ${reasons.join(', ')}`,
      });
      await markNeedsReview(collection, vehicle._id, reasons.join('; '));
    }
  }
  report.counts.vehiclesWithPlaceholderData = placeholderCount;
}

async function getValidLicensePlates(
  db: Awaited<ReturnType<typeof connectToDatabase>>
): Promise<Set<string>> {
  const vehicles = await db
    .collection('tblvehicles')
    .find({ isDeleted: { $ne: true }, ...tenantFilter() }, { projection: { license_plate: 1 } })
    .toArray();
  return new Set(vehicles.map((v) => String(v.license_plate).toUpperCase()));
}

async function auditOrphanReferences(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  report: AuditReport,
  validPlates: Set<string>
) {
  const targets: Array<{ collectionName: string; category: string }> = [
    { collectionName: 'tblexpenses', category: 'expense_orphan_vehicle' },
    { collectionName: 'tbltrips', category: 'trip_orphan_vehicle' },
    { collectionName: 'tblfuellogs', category: 'fuellog_orphan_vehicle' },
    { collectionName: 'tblreminders', category: 'maintenance_orphan_vehicle' },
  ];

  for (const target of targets) {
    const collection = db.collection(target.collectionName);
    const cursor = collection.find({ isDeleted: { $ne: true }, ...tenantFilter() });
    let orphanCount = 0;

    for await (const record of cursor) {
      const plate = record.license_plate ? String(record.license_plate).toUpperCase() : null;
      const isOrphan = !plate || plate === 'UNKNOWN' || !validPlates.has(plate);

      if (isOrphan) {
        orphanCount += 1;
        report.issues.push({
          category: target.category,
          collection: target.collectionName,
          id: String(record._id),
          detail: `references license_plate="${record.license_plate ?? '(none)'}" which has no matching active vehicle`,
        });
        await markNeedsReview(collection, record._id, `orphan reference: license_plate="${record.license_plate ?? '(none)'}"`);
      }
    }

    report.counts[`${target.collectionName}Orphans`] = orphanCount;
  }
}

async function auditMashedMaintenanceTitles(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  report: AuditReport
) {
  const collection = db.collection('tblreminders');
  const cursor = collection.find({ isDeleted: { $ne: true }, ...tenantFilter() });
  let mashCount = 0;

  for await (const reminder of cursor) {
    if (looksLikeMashedInput(reminder.title)) {
      mashCount += 1;
      report.issues.push({
        category: 'maintenance_test_data',
        collection: 'tblreminders',
        id: String(reminder._id),
        detail: `title="${reminder.title}" looks like placeholder/test input, not a real service description`,
      });
      await markNeedsReview(collection, reminder._id, `title looks like test data: "${reminder.title}"`);
    }
  }
  report.counts.maintenanceLikelyTestData = mashCount;
}

/**
 * Same business rule as the fixed MaintenanceRepository.getMaintenanceStats:
 * a reminder is "overdue" when it is unresolved (not completed/cancelled)
 * and its due_date has passed -- independent of whatever status string is
 * currently stored. This corrects any reminder stuck with a stale
 * 'pending' status past its due date, or a stale 'overdue' status whose
 * due_date has since been pushed into the future.
 */
async function recalculateMaintenanceStatuses(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  report: AuditReport
) {
  const collection = db.collection('tblreminders');
  const now = new Date();
  const UNRESOLVED = { $nin: ['completed', 'cancelled'] };

  const toOverdue = await collection
    .find({ ...tenantFilter(), isDeleted: { $ne: true }, status: UNRESOLVED, due_date: { $lt: now }, status: { $ne: 'overdue' } })
    .toArray();

  const toPending = await collection
    .find({ ...tenantFilter(), isDeleted: { $ne: true }, status: 'overdue', due_date: { $gte: now } })
    .toArray();

  report.counts.remindersToMarkOverdue = toOverdue.length;
  report.counts.remindersToRevertToPending = toPending.length;

  for (const r of toOverdue) {
    report.issues.push({
      category: 'maintenance_status_correction',
      collection: 'tblreminders',
      id: String(r._id),
      detail: `status="${r.status}" but due_date has passed -> should be "overdue"`,
    });
  }
  for (const r of toPending) {
    report.issues.push({
      category: 'maintenance_status_correction',
      collection: 'tblreminders',
      id: String(r._id),
      detail: `status="overdue" but due_date is in the future -> should be "pending"`,
    });
  }

  if (APPLY) {
    if (toOverdue.length > 0) {
      await collection.updateMany(
        { _id: { $in: toOverdue.map((r) => r._id) } },
        { $set: { status: 'overdue', updatedAt: now } }
      );
    }
    if (toPending.length > 0) {
      await collection.updateMany(
        { _id: { $in: toPending.map((r) => r._id) } },
        { $set: { status: 'pending', updatedAt: now } }
      );
    }
  }
}

async function run() {
  console.log(`\n=== Fleet Data Integrity Audit ===`);
  console.log(`Mode: ${APPLY ? 'APPLY (safe fixes will be written)' : 'REPORT ONLY (no writes)'}`);
  console.log(`Tenant scope: ${SCOPE_TENANT ?? 'ALL TENANTS'}\n`);

  const db = await connectToDatabase();
  const report: AuditReport = { issues: [], counts: {} };

  await auditVehicles(db, report);
  const validPlates = await getValidLicensePlates(db);
  await auditOrphanReferences(db, report, validPlates);
  await auditMashedMaintenanceTitles(db, report);
  await recalculateMaintenanceStatuses(db, report);

  console.log('--- Summary ---');
  for (const [key, value] of Object.entries(report.counts)) {
    console.log(`${key}: ${value}`);
  }

  console.log(`\nTotal issues found: ${report.issues.length}`);
  if (!APPLY && report.issues.length > 0) {
    console.log('\nRun again with --apply to flag these records with needsReview=true');
    console.log('(and to correct stale maintenance overdue/pending statuses).');
  }

  console.log('\n--- Detail (first 50) ---');
  for (const issue of report.issues.slice(0, 50)) {
    console.log(`[${issue.category}] ${issue.collection}/${issue.id}: ${issue.detail}`);
  }
  if (report.issues.length > 50) {
    console.log(`...and ${report.issues.length - 50} more.`);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});