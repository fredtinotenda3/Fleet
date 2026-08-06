// scripts/tenant-data-repair.ts
//
// Enterprise tenant data remediation.
//
//   npx tsx scripts/tenant-data-repair.ts            # DRY RUN (default)
//   npx tsx scripts/tenant-data-repair.ts --apply    # commit writes
//
// GUARANTEES
//   - Dry run unless --apply is passed explicitly.
//   - Nothing is ever deleted. Not one document, not one field.
//   - Ownership is never GUESSED. A row is only re-stamped when a
//     deterministic link proves its owner; anything else is classified
//     and left untouched for a human.
//   - Organizations are never merged, renamed, or created — even the two
//     distinct tenants sharing the display name "Toyota Zimbabwe".
//   - Ambiguous user accounts are never auto-assigned.
//   - Every write is recorded to tbltenant_repair_audit with before and
//     after values, so any change can be reviewed or reversed.
//   - Unrecoverable rows are exported to reports/ BEFORE any write runs.
//
// RECOVERABILITY LADDERS, in descending confidence. First hit wins.
//   L1  the row's own organizationId / orgUnitId resolves to a real org
//   L2  createdBy / updatedBy -> tbladmin -> that user's real tenantId
//   L3  the row's parent record (vehicle, by license_plate) has a real
//       tenantId
//   L4  usage references: every row that points AT this record (e.g.
//       tblfuellogs.driver_id) agrees on a single real tenantId
//
// L4 is what the original forensics pass lacked, and it is the ladder
// that recovers the 77 orphaned drivers: each is referenced by fuel logs
// which themselves carry a correct tenant slug.
//
// CLASSIFICATION
//   RECOVERABLE    exactly one real owner proven -> re-stamped on --apply
//   NEEDS_REVIEW   evidence exists but disagrees (two or more candidate
//                  owners), or the row is a cross-tenant structural
//                  conflict -> exported, never touched
//   UNRECOVERABLE  no evidence at all -> exported, never touched

import { Db, MongoClient, Document, ObjectId } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
  buildTenantIdentityIndex,
  resolveCanonical,
  isUnusableTenantValue,
  toObjectIdOrNull,
  type TenantIdentityIndex,
} from './lib/tenant-identity';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const REPORT_DIR = path.resolve(process.cwd(), 'reports');
const AUDIT_COLLECTION = 'tbltenant_repair_audit';
const RUN_ID = new ObjectId().toHexString();

type Classification = 'RECOVERABLE' | 'NEEDS_REVIEW' | 'UNRECOVERABLE';

interface RowVerdict {
  collection: string;
  documentId: string;
  currentTenantId: unknown;
  classification: Classification;
  resolvedTenantId?: string;
  ladder?: string;
  reason?: string;
  candidates?: string[];
  identity?: Record<string, unknown>;
}

/** Collections carrying tenant-owned business data, with the links used
 *  to reconstruct ownership. */
interface CollectionSpec {
  name: string;
  /** Field joining this row to a vehicle (ladder L3). */
  vehicleRef?: string;
  /** Collections that reference THIS collection's _id (ladder L4). */
  usageRefs?: Array<{ collection: string; field: string }>;
  /** Fields shown in the export so a human can identify the row. */
  identityFields: string[];
}

const COLLECTIONS: CollectionSpec[] = [
  { name: 'tblvehicles', identityFields: ['license_plate', 'make', 'model'] },
  {
    name: 'tbldrivers',
    identityFields: ['name', 'driver_code', 'license_number'],
    usageRefs: [
      { collection: 'tblfuellogs', field: 'driver_id' },
      { collection: 'tbltrips', field: 'driver_id' },
      { collection: 'tblworkorders', field: 'driver_id' },
      { collection: 'tblbookings', field: 'driver_id' },
    ],
  },
  { name: 'tblexpenses', vehicleRef: 'license_plate', identityFields: ['license_plate', 'category', 'amount', 'date'] },
  { name: 'tblfuellogs', vehicleRef: 'license_plate', identityFields: ['license_plate', 'date', 'fuel_volume', 'cost'] },
  { name: 'tbltrips', vehicleRef: 'license_plate', identityFields: ['license_plate', 'start_time', 'driver_id'] },
  { name: 'tblreminders', vehicleRef: 'license_plate', identityFields: ['license_plate', 'title', 'due_date'] },
  { name: 'tblworkorders', vehicleRef: 'license_plate', identityFields: ['license_plate', 'status', 'description'] },
  { name: 'tblfuelcards', identityFields: ['card_number', 'provider', 'status'] },
  { name: 'tblfuelstations', identityFields: ['name', 'brand', 'city'] },
  { name: 'tblreportdefinitions', identityFields: ['name', 'dataSource', 'createdBy'] },
  { name: 'tbldashboards', identityFields: ['name', 'createdBy'] },
  { name: 'tblorgunits', identityFields: ['name', 'code', 'type', 'isDeleted'] },
  { name: 'tblnotifications', identityFields: ['title', 'type', 'userId'] },
  { name: 'tblvendors', identityFields: ['name', 'category'] },
  { name: 'tblinvoices', identityFields: ['invoice_number', 'vendor', 'amount'] },
  { name: 'tblpurchaseorders', identityFields: ['po_number', 'vendor', 'status'] },
  { name: 'tblspareparts', identityFields: ['part_number', 'name'] },
  { name: 'tblstockmovements', identityFields: ['part_number', 'movement_type', 'quantity'] },
  { name: 'tbltelematics', identityFields: ['license_plate', 'device_id'] },
  { name: 'tblbookings', identityFields: ['license_plate', 'status', 'start_time'] },
  { name: 'tblcompliancerecords', identityFields: ['license_plate', 'type', 'status'] },
];

const log: string[] = [];
function say(line = '') {
  console.log(line);
  log.push(line);
}

function ensureReportDir(): void {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
}

function writeReport(filename: string, payload: unknown): string {
  ensureReportDir();
  const target = path.join(REPORT_DIR, filename);
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf-8');
  return target;
}

function pick(doc: Document, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (doc[f] !== undefined) out[f] = doc[f];
  return out;
}

function contaminationFilter(): Document {
  return {
    $or: [
      { tenantId: { $in: ['default', 'system', 'super_admin'] } },
      { tenantId: { $exists: false } },
      { tenantId: null },
      { tenantId: '' },
    ],
  };
}

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------

interface UserVerdict {
  userId: string;
  email: string;
  role?: string;
  roles?: string[];
  currentTenantId: unknown;
  classification: Classification;
  resolvedTenantId?: string;
  ladder?: string;
  reason?: string;
  possibleOrganizations?: Array<{ tenantId: string; name: string; via: string }>;
}

async function classifyUsers(
  db: Db,
  index: TenantIdentityIndex
): Promise<{ verdicts: UserVerdict[]; userTenant: Map<string, string> }> {
  const orgs = await db
    .collection('tblorganizations')
    .find({}, { projection: { name: 1, slug: 1, tenantId: 1, ownerId: 1, members: 1 } })
    .toArray();

  // userId -> set of candidate canonical tenantIds, with provenance
  const candidates = new Map<string, Map<string, string>>();
  function addCandidate(userId: string, canonical: string, via: string) {
    if (!userId || !canonical) return;
    const m = candidates.get(userId) ?? new Map<string, string>();
    if (!m.has(canonical)) m.set(canonical, via);
    candidates.set(userId, m);
  }

  for (const org of orgs) {
    const canonical =
      resolveCanonical(index, org.tenantId) ??
      resolveCanonical(index, org.slug) ??
      resolveCanonical(index, String(org._id));
    if (!canonical) continue;

    if (org.ownerId) addCandidate(String(org.ownerId), canonical, 'organization owner');
    for (const m of (org.members ?? []) as Array<{ userId?: string }>) {
      if (m?.userId) addCandidate(String(m.userId), canonical, 'organization member');
    }
  }

  // Scope assignments
  if ((await db.listCollections({ name: 'tbluser_scope_assignments' }).toArray()).length) {
    const rows = await db
      .collection('tbluser_scope_assignments')
      .find({}, { projection: { userId: 1, tenantId: 1 } })
      .toArray();
    for (const r of rows) {
      const canonical = resolveCanonical(index, r.tenantId);
      if (r.userId && canonical) addCandidate(String(r.userId), canonical, 'scope assignment');
    }
  }

  const users = await db
    .collection('tbladmin')
    .find({}, { projection: { Email: 1, Role: 1, roles: 1, tenantId: 1 } })
    .toArray();

  const verdicts: UserVerdict[] = [];
  const userTenant = new Map<string, string>();

  for (const u of users) {
    const userId = String(u._id);
    const roles: string[] = Array.isArray(u.roles) ? u.roles.map(String) : [];
    const current = u.tenantId;
    const existing = resolveCanonical(index, current);

    if (existing) {
      userTenant.set(userId, existing);
      verdicts.push({
        userId,
        email: String(u.Email ?? '(no email)'),
        role: u.Role ? String(u.Role) : undefined,
        roles,
        currentTenantId: current,
        classification: 'RECOVERABLE',
        resolvedTenantId: existing,
        ladder: 'already valid (canonicalised)',
      });
      continue;
    }

    const isPlatformAdmin = roles.includes('super_admin') || u.Role === 'super_admin';
    const cand = candidates.get(userId) ?? new Map<string, string>();

    // A genuine platform SUPER_ADMIN is not scoped to any organization.
    // It is NOT a defect and must not be assigned one — the application
    // gives it PLATFORM_SCOPE_TENANT_ID at authentication time.
    if (isPlatformAdmin && cand.size !== 1) {
      verdicts.push({
        userId,
        email: String(u.Email ?? '(no email)'),
        role: u.Role ? String(u.Role) : undefined,
        roles,
        currentTenantId: current,
        classification: 'NEEDS_REVIEW',
        reason:
          cand.size > 1
            ? 'SUPER_ADMIN and a member of multiple organizations — confirm this should be a platform admin (no tenant) rather than an org user'
            : 'SUPER_ADMIN with no organization link — expected for a true platform admin; confirm intent',
        possibleOrganizations: [...cand].map(([tenantId, via]) => ({
          tenantId,
          name: index.byCanonical.get(tenantId)?.name ?? '(unknown)',
          via,
        })),
      });
      continue;
    }

    if (cand.size === 1) {
      const [canonical, via] = [...cand][0];
      userTenant.set(userId, canonical);
      verdicts.push({
        userId,
        email: String(u.Email ?? '(no email)'),
        role: u.Role ? String(u.Role) : undefined,
        roles,
        currentTenantId: current,
        classification: 'RECOVERABLE',
        resolvedTenantId: canonical,
        ladder: via,
      });
      continue;
    }

    verdicts.push({
      userId,
      email: String(u.Email ?? '(no email)'),
      role: u.Role ? String(u.Role) : undefined,
      roles,
      currentTenantId: current,
      classification: cand.size > 1 ? 'NEEDS_REVIEW' : 'UNRECOVERABLE',
      reason:
        cand.size > 1
          ? `Member of ${cand.size} organizations — ownership is genuinely ambiguous and will NOT be guessed`
          : 'No organization membership, ownership, or scope assignment found',
      possibleOrganizations: [...cand].map(([tenantId, via]) => ({
        tenantId,
        name: index.byCanonical.get(tenantId)?.name ?? '(unknown)',
        via,
      })),
    });
  }

  return { verdicts, userTenant };
}

// ---------------------------------------------------------------------
// Business rows
// ---------------------------------------------------------------------

async function classifyCollection(
  db: Db,
  spec: CollectionSpec,
  index: TenantIdentityIndex,
  userTenant: Map<string, string>
): Promise<RowVerdict[]> {
  if ((await db.listCollections({ name: spec.name }).toArray()).length === 0) return [];

  const col = db.collection(spec.name);
  const docs = await col.find(contaminationFilter()).toArray();
  if (docs.length === 0) return [];

  // Pre-load the vehicle plate -> tenant map once (ladder L3).
  let plateToTenant: Map<string, Set<string>> | null = null;
  if (spec.vehicleRef) {
    plateToTenant = new Map();
    const vehicles = await db
      .collection('tblvehicles')
      .find({}, { projection: { license_plate: 1, tenantId: 1 } })
      .toArray();
    for (const v of vehicles) {
      const canonical = resolveCanonical(index, v.tenantId);
      const plate = v.license_plate ? String(v.license_plate) : '';
      if (!canonical || !plate) continue;
      plateToTenant.set(plate, (plateToTenant.get(plate) ?? new Set()).add(canonical));
    }
  }

  const verdicts: RowVerdict[] = [];

  for (const doc of docs) {
    const documentId = String(doc._id);
    const base = {
      collection: spec.name,
      documentId,
      currentTenantId: doc.tenantId ?? null,
      identity: pick(doc, spec.identityFields),
    };

    // ---- L1: the row's own organization reference --------------------
    const viaOrgField =
      resolveCanonical(index, doc.organizationId) ?? resolveCanonical(index, doc.orgUnitId);
    if (viaOrgField) {
      verdicts.push({
        ...base,
        classification: 'RECOVERABLE',
        resolvedTenantId: viaOrgField,
        ladder: 'L1 organizationId on the row',
      });
      continue;
    }

    // ---- L2: creator's tenant ----------------------------------------
    const creator = doc.createdBy ?? doc.updatedBy;
    const viaCreator = creator ? userTenant.get(String(creator)) : undefined;
    if (viaCreator) {
      verdicts.push({
        ...base,
        classification: 'RECOVERABLE',
        resolvedTenantId: viaCreator,
        ladder: 'L2 createdBy -> user tenant',
      });
      continue;
    }

    // ---- L3: parent vehicle ------------------------------------------
    if (spec.vehicleRef && plateToTenant) {
      const plate = doc[spec.vehicleRef] ? String(doc[spec.vehicleRef]) : '';
      const owners = plate ? plateToTenant.get(plate) : undefined;
      if (owners && owners.size === 1) {
        verdicts.push({
          ...base,
          classification: 'RECOVERABLE',
          resolvedTenantId: [...owners][0],
          ladder: `L3 parent vehicle (${spec.vehicleRef}=${plate})`,
        });
        continue;
      }
      if (owners && owners.size > 1) {
        verdicts.push({
          ...base,
          classification: 'NEEDS_REVIEW',
          candidates: [...owners],
          reason: `Plate ${plate} exists in ${owners.size} tenants — cannot attribute without human input`,
        });
        continue;
      }
    }

    // ---- L4: usage references ----------------------------------------
    if (spec.usageRefs?.length) {
      const owners = new Set<string>();
      const provenance: string[] = [];
      for (const ref of spec.usageRefs) {
        if ((await db.listCollections({ name: ref.collection }).toArray()).length === 0) continue;
        const oid = toObjectIdOrNull(documentId);
        const match: Document = {
          $or: [{ [ref.field]: documentId }, ...(oid ? [{ [ref.field]: oid }] : [])],
        };
        const tenants = await db.collection(ref.collection).distinct('tenantId', match);
        for (const t of tenants) {
          const canonical = resolveCanonical(index, t);
          if (canonical) {
            owners.add(canonical);
            provenance.push(`${ref.collection}.${ref.field}`);
          }
        }
      }
      if (owners.size === 1) {
        verdicts.push({
          ...base,
          classification: 'RECOVERABLE',
          resolvedTenantId: [...owners][0],
          ladder: `L4 usage reference (${[...new Set(provenance)].join(', ')})`,
        });
        continue;
      }
      if (owners.size > 1) {
        verdicts.push({
          ...base,
          classification: 'NEEDS_REVIEW',
          candidates: [...owners],
          reason: `Referenced by rows in ${owners.size} different tenants — a shared record that must be split or assigned by hand`,
        });
        continue;
      }
    }

    verdicts.push({
      ...base,
      classification: 'UNRECOVERABLE',
      reason:
        'No organizationId, no resolvable creator, no parent record, and no inbound references. Ownership cannot be established from the data.',
    });
  }

  return verdicts;
}

/** Child rows whose parent vehicle belongs to a DIFFERENT tenant. Never
 *  auto-fixed: re-stamping the child detaches it from its parent, and
 *  re-stamping the parent detaches it from its other children. */
async function findCrossTenantConflicts(db: Db, index: TenantIdentityIndex) {
  const conflicts: Array<Record<string, unknown>> = [];
  const specs = COLLECTIONS.filter((c) => c.vehicleRef);

  const vehicles = await db
    .collection('tblvehicles')
    .find({}, { projection: { license_plate: 1, tenantId: 1 } })
    .toArray();
  const plateToTenant = new Map<string, string>();
  for (const v of vehicles) {
    const canonical = resolveCanonical(index, v.tenantId);
    if (canonical && v.license_plate) plateToTenant.set(String(v.license_plate), canonical);
  }

  for (const spec of specs) {
    if ((await db.listCollections({ name: spec.name }).toArray()).length === 0) continue;
    const rows = await db
      .collection(spec.name)
      .find({ [spec.vehicleRef!]: { $exists: true, $ne: null } })
      .toArray();
    for (const r of rows) {
      const rowTenant = resolveCanonical(index, r.tenantId);
      const parentTenant = plateToTenant.get(String(r[spec.vehicleRef!]));
      if (rowTenant && parentTenant && rowTenant !== parentTenant) {
        conflicts.push({
          collection: spec.name,
          documentId: String(r._id),
          rowTenantId: rowTenant,
          parentVehicleTenantId: parentTenant,
          vehicleRef: r[spec.vehicleRef!],
          identity: pick(r, spec.identityFields),
          classification: 'NEEDS_REVIEW',
          reason:
            'Row and its parent vehicle belong to different tenants. Not repairable by re-stamping either side.',
        });
      }
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Aborting.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  say('='.repeat(74));
  say(`TENANT DATA REPAIR  --  ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);
  say(`Database: ${db.databaseName}`);
  say(`Run id:   ${RUN_ID}`);
  say('='.repeat(74));

  const index = await buildTenantIdentityIndex(db);

  say('');
  say(`ORGANIZATIONS: ${index.organizations.length}  (never merged, never created)`);
  for (const o of index.organizations) {
    say(`  ${o.canonicalTenantId.padEnd(38)} ${o.name}${o.isDeleted ? '  [deleted]' : ''}`);
  }
  if (index.duplicateNames.size) {
    say('');
    say('  NOTE: distinct organizations sharing a display name:');
    for (const [, list] of index.duplicateNames) {
      say(`    "${list[0].name}" -> ${list.map((l) => l.canonicalTenantId).join(' , ')}`);
    }
    say('    These are SEPARATE tenants. They are not merged.');
  }

  // ---- users ---------------------------------------------------------
  const { verdicts: userVerdicts, userTenant } = await classifyUsers(db, index);
  const usersRecoverable = userVerdicts.filter((v) => v.classification === 'RECOVERABLE');
  const usersReview = userVerdicts.filter((v) => v.classification === 'NEEDS_REVIEW');
  const usersUnrecoverable = userVerdicts.filter((v) => v.classification === 'UNRECOVERABLE');
  const usersToWrite = usersRecoverable.filter(
    (v) => String(v.currentTenantId ?? '') !== v.resolvedTenantId
  );

  say('');
  say('-'.repeat(74));
  say('1. ACCOUNTS');
  say('-'.repeat(74));
  say(`  total ................................. ${userVerdicts.length}`);
  say(`  RECOVERABLE ........................... ${usersRecoverable.length}`);
  say(`     of which need a write ............... ${usersToWrite.length}`);
  say(`  NEEDS_REVIEW (never auto-assigned) .... ${usersReview.length}`);
  say(`  UNRECOVERABLE ......................... ${usersUnrecoverable.length}`);

  // ---- business rows -------------------------------------------------
  say('');
  say('-'.repeat(74));
  say('2. BUSINESS RECORDS');
  say('-'.repeat(74));

  const allRows: RowVerdict[] = [];
  for (const spec of COLLECTIONS) {
    const verdicts = await classifyCollection(db, spec, index, userTenant);
    if (verdicts.length === 0) continue;
    allRows.push(...verdicts);

    const r = verdicts.filter((v) => v.classification === 'RECOVERABLE').length;
    const n = verdicts.filter((v) => v.classification === 'NEEDS_REVIEW').length;
    const u = verdicts.filter((v) => v.classification === 'UNRECOVERABLE').length;
    say(
      `  ${spec.name.padEnd(24)} contaminated=${String(verdicts.length).padStart(5)}  ` +
        `RECOVERABLE=${String(r).padStart(5)}  NEEDS_REVIEW=${String(n).padStart(4)}  UNRECOVERABLE=${String(u).padStart(5)}`
    );
  }
  if (allRows.length === 0) say('  (no contaminated business records found)');

  const conflicts = await findCrossTenantConflicts(db, index);
  say('');
  say(`  cross-tenant parent conflicts ......... ${conflicts.length}  (never auto-fixed)`);

  // ---- reports, written BEFORE any mutation --------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manualReview = writeReport('tenant-manual-review.json', {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    database: db.databaseName,
    mode: APPLY ? 'apply' : 'dry-run',
    organizations: index.organizations.map((o) => ({
      tenantId: o.canonicalTenantId,
      name: o.name,
      objectId: o.objectId,
    })),
    duplicateOrganizationNames: [...index.duplicateNames.values()].map((list) =>
      list.map((l) => ({ tenantId: l.canonicalTenantId, name: l.name }))
    ),
    accountsRequiringDecision: [...usersReview, ...usersUnrecoverable].map((v) => ({
      email: v.email,
      role: v.role,
      roles: v.roles,
      currentTenantId: v.currentTenantId,
      classification: v.classification,
      reasonUnresolved: v.reason,
      possibleOrganizations: v.possibleOrganizations ?? [],
    })),
  });

  const unrecoverableExport = writeReport(`tenant-unrecoverable-rows-${stamp}.json`, {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    note: 'Exported BEFORE any write. Nothing in this file was modified or deleted.',
    rows: allRows.filter((r) => r.classification !== 'RECOVERABLE'),
    crossTenantConflicts: conflicts,
  });

  const planExport = writeReport(`tenant-repair-plan-${stamp}.json`, {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    accountWrites: usersToWrite.map((v) => ({
      email: v.email,
      userId: v.userId,
      from: v.currentTenantId,
      to: v.resolvedTenantId,
      ladder: v.ladder,
    })),
    rowWrites: allRows
      .filter((r) => r.classification === 'RECOVERABLE')
      .map((r) => ({
        collection: r.collection,
        documentId: r.documentId,
        from: r.currentTenantId,
        to: r.resolvedTenantId,
        ladder: r.ladder,
      })),
  });

  say('');
  say('  Reports written:');
  say(`    ${path.relative(process.cwd(), manualReview)}`);
  say(`    ${path.relative(process.cwd(), unrecoverableExport)}`);
  say(`    ${path.relative(process.cwd(), planExport)}`);

  const rowsToWrite = allRows.filter((r) => r.classification === 'RECOVERABLE');

  say('');
  say('='.repeat(74));
  say('3. PLAN');
  say('='.repeat(74));
  say(`  account tenantId writes ............... ${usersToWrite.length}`);
  say(`  business row tenantId writes .......... ${rowsToWrite.length}`);
  say(`  left untouched for human review ....... ${allRows.length - rowsToWrite.length + usersReview.length + usersUnrecoverable.length}`);
  say('  deletions ............................. 0  (this script never deletes)');

  if (!APPLY) {
    say('');
    say('  DRY RUN — nothing was written. Review the reports above, then');
    say('  re-run with --apply to commit exactly the plan shown.');
    await client.close();
    return;
  }

  // ---- apply ---------------------------------------------------------
  const audit = db.collection(AUDIT_COLLECTION);
  let written = 0;

  for (const v of usersToWrite) {
    const oid = toObjectIdOrNull(v.userId);
    if (!oid) continue;
    const res = await db
      .collection('tbladmin')
      .updateOne(
        { _id: oid },
        { $set: { tenantId: v.resolvedTenantId, tenantRepairedAt: new Date() } }
      );
    if (res.modifiedCount) {
      written += 1;
      await audit.insertOne({
        runId: RUN_ID,
        at: new Date(),
        collection: 'tbladmin',
        documentId: v.userId,
        field: 'tenantId',
        before: v.currentTenantId ?? null,
        after: v.resolvedTenantId,
        ladder: v.ladder,
        actor: 'scripts/tenant-data-repair.ts',
      });
    }
  }

  for (const r of rowsToWrite) {
    const oid = toObjectIdOrNull(r.documentId);
    if (!oid) continue;
    const res = await db
      .collection(r.collection)
      .updateOne(
        { _id: oid },
        { $set: { tenantId: r.resolvedTenantId, tenantRepairedAt: new Date() } }
      );
    if (res.modifiedCount) {
      written += 1;
      await audit.insertOne({
        runId: RUN_ID,
        at: new Date(),
        collection: r.collection,
        documentId: r.documentId,
        field: 'tenantId',
        before: r.currentTenantId ?? null,
        after: r.resolvedTenantId,
        ladder: r.ladder,
        identity: r.identity,
        actor: 'scripts/tenant-data-repair.ts',
      });
    }
  }

  say('');
  say(`  APPLIED: ${written} document(s) updated.`);
  say(`  Audit trail: db.${AUDIT_COLLECTION}.find({ runId: "${RUN_ID}" })`);
  say('  Re-run `npm run db:forensics` to confirm the new state.');

  await client.close();
}

main().catch((err) => {
  console.error('Repair failed:', err);
  process.exit(1);
});
