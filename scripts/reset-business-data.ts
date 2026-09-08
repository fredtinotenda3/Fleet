// scripts/reset-business-data.ts
//
// Clears OPERATIONAL data while leaving a tenant able to log in and keep
// working: accounts, organizations, org units, roles, permissions,
// workflow and rule DEFINITIONS, report templates and platform
// configuration all survive.
//
// ---------------------------------------------------------------------
// THE ONLY THING THAT MATTERS IN THIS FILE IS THE CLASSIFICATION
// ---------------------------------------------------------------------
// The deletion mechanics are ten lines. The risk is entirely in deciding
// which of the ~66 collections is "operational data" and which is
// "configuration a customer would have to rebuild by hand".
//
// So the classification is DATA, stated once, with a reason per entry,
// and every collection in the database must appear in exactly one of the
// three lists. A collection that appears in NEITHER list is a hard
// failure, not a default -- see the reconciliation step. That is the
// property that matters: the next engineer who adds a collection cannot
// have it silently deleted, and cannot have it silently preserved
// either. They have to decide.
//
// ---------------------------------------------------------------------
// SAFETY
// ---------------------------------------------------------------------
//   * DRY RUN BY DEFAULT. `--confirm` to delete.
//   * NEVER DROPS A COLLECTION. deleteMany only, so indexes, validators
//     and collation survive and no re-creation step is needed.
//   * Prints a full manifest -- every collection, its classification,
//     its reason, and the exact document count that would be removed --
//     BEFORE deleting anything.
//   * `--tenant <slug>` scopes the whole run to one organization.
//     Without it the script refuses to touch a database that contains
//     more than one tenant, because "reset the business data" almost
//     never means "for every customer at once".
//   * `--yes-all-tenants` is the explicit override for that refusal.
//
// Usage:
//   npm run db:reset-business-data -- --tenant <slug>              # dry run
//   npm run db:reset-business-data -- --tenant <slug> --confirm    # delete
//   npm run db:reset-business-data -- --confirm --yes-all-tenants  # every tenant

/* eslint-disable no-console */

import { MongoClient, Db } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

interface Entry {
  collection: string;
  reason: string;
}

/**
 * CLEARED. Operational records a customer generates by running their
 * fleet. Re-creatable by operating the fleet again; not re-creatable by
 * an administrator sitting at a settings screen.
 */
const CLEAR: Entry[] = [
  // ── Core fleet ────────────────────────────────────────────────────
  { collection: 'tblvehicles', reason: 'Fleet roster' },
  { collection: 'tbldrivers', reason: 'Driver roster' },
  { collection: 'tbltrips', reason: 'Trips, including telemetry-generated ones' },
  { collection: 'tblfuellogs', reason: 'Fuel transactions' },
  { collection: 'tblexpenses', reason: 'Expense transactions' },
  { collection: 'tblreminders', reason: 'Maintenance reminders' },
  { collection: 'tblmaintenance', reason: 'Maintenance records' },
  { collection: 'tblmeterlogs', reason: 'Odometer/meter readings' },

  // ── Workshop, inventory, dispatch ─────────────────────────────────
  { collection: 'tblworkorders', reason: 'Work orders' },
  { collection: 'tblworkshopbays', reason: 'Workshop bays' },
  { collection: 'tblmechanicassignments', reason: 'Mechanic assignments' },
  { collection: 'tblspareparts', reason: 'Parts catalogue and stock levels' },
  { collection: 'tblstockmovements', reason: 'Stock movement history' },
  { collection: 'tbldispatchjobs', reason: 'Dispatch jobs' },
  { collection: 'tblbookings', reason: 'Vehicle bookings' },
  { collection: 'tbldrivershifts', reason: 'Driver shift roster' },
  { collection: 'tblpurchaserequests', reason: 'Procurement requests' },
  { collection: 'tblpurchaseorders', reason: 'Purchase orders' },

  // ── Telematics operational data ───────────────────────────────────
  { collection: 'tbltelematics', reason: 'Raw telemetry readings' },
  { collection: 'tbltelematics_alerts', reason: 'Telemetry-derived alerts' },
  { collection: 'tbltelematics_daily_rollup', reason: 'Daily telemetry aggregates' },
  { collection: 'tbltelematics_geofences', reason: 'Geofences (operator-drawn, tied to sites that no longer have vehicles)' },
  { collection: 'tbltelematics_geofence_states', reason: 'Per-vehicle inside/outside state' },
  { collection: 'tbltelematics_devices', reason: 'Registered tracker devices' },
  { collection: 'tbltelematics_eagletrack_links', reason: 'Tracker-to-vehicle mapping (vehicles are being cleared)' },
  { collection: 'tbltelematics_eagletrack_triggers', reason: 'Synced vendor triggers' },
  { collection: 'tblgeocode_cache', reason: 'Reverse-geocode cache; pure derived data' },
  { collection: 'tbltrip_detection_state', reason: 'Trip-generation watermarks; MUST be cleared with the trips they track' },
  { collection: 'tblvehicledigitaltwins', reason: 'Vehicle digital twins; projections of cleared vehicles' },

  // ── Intelligence and attention ────────────────────────────────────
  { collection: 'tblattentionitems', reason: 'Needs-attention queue' },
  { collection: 'tblattention_dispatches', reason: 'Attention dispatch records' },
  { collection: 'tblanomalies', reason: 'Detected anomalies' },

  // ── Finance ───────────────────────────────────────────────────────
  { collection: 'tblallocationledger', reason: 'Cost allocation postings' },
  { collection: 'tblvalueledger', reason: 'Realised-value postings' },
  { collection: 'tbldepreciationprofiles', reason: 'Per-vehicle depreciation policy; vehicles are being cleared' },
  { collection: 'tblglsubmissions', reason: 'GL reconciliation submissions' },
  { collection: 'tblinvoices', reason: 'Customer invoices' },

  // ── Compliance ────────────────────────────────────────────────────
  { collection: 'tblcompliancerecords', reason: 'Per-entity compliance records' },
  { collection: 'tbldvirinspections', reason: 'Driver vehicle inspection reports' },
  { collection: 'tblslatrackings', reason: 'Per-job SLA tracking instances' },
  { collection: 'tblslabreaches', reason: 'Recorded SLA breaches' },

  // ── Notifications and activity ────────────────────────────────────
  { collection: 'tblnotifications', reason: 'In-app notifications about cleared records' },
  { collection: 'tblworkflow_instances', reason: 'Running/completed workflow INSTANCES (definitions are preserved)' },
  { collection: 'tblreportexecutions', reason: 'Report run history' },
  { collection: 'tblwebhookdeliveries', reason: 'Webhook delivery log' },
  { collection: 'tbloutbox_events', reason: 'Undelivered domain events about cleared records' },
  { collection: 'tbldeadletterqueue', reason: 'Failed jobs referencing cleared records' },

  // ── Reference data tied to operations ─────────────────────────────
  { collection: 'tblfuelcards', reason: 'Fuel cards bound to cleared vehicles' },
];

/**
 * PRESERVED. Things a customer configured, or that they need in order to
 * log in and start again. Deleting any of these turns "reset my data"
 * into "rebuild my tenant".
 */
const PRESERVE: Entry[] = [
  // ── Identity and access ───────────────────────────────────────────
  { collection: 'tbladmin', reason: 'LOGIN CREDENTIALS. Deleting this locks everyone out.' },
  { collection: 'tblorganizations', reason: 'Organizations, members roster, subscription, settings, branding' },
  { collection: 'tblorgunits', reason: 'Branch/department/workshop/fleet tree; everything inherits scope from it' },
  { collection: 'tbluser_scope_assignments', reason: 'Which user is assigned to which org unit' },
  { collection: 'tblcustomroles', reason: 'Customer-defined roles' },
  { collection: 'tblresourcepermissions', reason: 'Per-resource grants' },
  { collection: 'tblapikeys', reason: 'Integration credentials in use by the customer' },
  { collection: 'tblssoconnections', reason: 'SSO configuration' },
  { collection: 'tbloauth_clients', reason: 'Registered OAuth clients' },

  // ── Definitions the customer authored ─────────────────────────────
  { collection: 'tblworkflows', reason: 'Workflow DEFINITIONS (instances are cleared)' },
  { collection: 'tblrules', reason: 'Automation rule definitions' },
  { collection: 'tblbusinessrules', reason: 'Business rule definitions' },
  { collection: 'tblcompliancerules', reason: 'Compliance POLICY (records are cleared)' },
  { collection: 'tblslapolicies', reason: 'SLA POLICY (trackings and breaches are cleared)' },
  { collection: 'tblreporttemplates', reason: 'System and customer report templates' },
  { collection: 'tblreportdefinitions', reason: 'Customer-authored report definitions' },
  { collection: 'tbldashboards', reason: 'Customer-authored dashboards' },
  { collection: 'tblkpidefinitions', reason: 'Customer-authored KPI definitions' },
  { collection: 'tblwebhooksubscriptions', reason: 'Webhook endpoints the customer registered' },

  // ── Shared reference data ─────────────────────────────────────────
  { collection: 'tblunits', reason: 'Global unit catalogue (km, litre); shared, no tenantId' },
  { collection: 'tblexpense_types', reason: 'Expense category catalogue; re-seeding it changes every category id' },
  { collection: 'tblfuelstations', reason: 'Station directory; organization-level reference data' },
  { collection: 'tblvendors', reason: 'Supplier directory' },
  { collection: 'tblscheduledjobs', reason: 'Platform cron schedule' },
  { collection: 'tblexternal_providers', reason: 'Telematics provider configuration and credentials' },
  { collection: 'tbltelematics_cartrack_config', reason: 'Cartrack integration credentials' },
  { collection: 'tbltelematics_eagletrack_config', reason: 'Eagle Track integration credentials' },
  { collection: 'tbltelematics_demo_state', reason: 'Demo-mode configuration' },
  { collection: 'tblplugins', reason: 'Installed plugin catalogue' },
  { collection: 'tblplugininstallations', reason: 'Per-tenant plugin installations' },

  // ── Audit and security history ────────────────────────────────────
  //
  // Deliberately preserved. An audit log is the record of WHO DID WHAT,
  // including who ran this reset. Clearing it as part of a data reset
  // would destroy the evidence trail for the reset itself, which is
  // precisely backwards, and in a regulated deployment would be a
  // finding of its own.
  { collection: 'tblauditlog', reason: 'Hash-chained audit trail; clearing it destroys the record of this reset' },
  { collection: 'tbltenant_repair_audit', reason: 'Migration/repair audit trail used by db:revert' },
  { collection: 'tblloginattempts', reason: 'Security history' },
  { collection: 'tblaccountlockouts', reason: 'Active lockout state' },
  { collection: 'tblusersessions', reason: 'Active sessions; clearing logs everyone out mid-reset' },
  { collection: 'tblrefreshtokens', reason: 'Active refresh tokens' },
  { collection: 'tblmfafactors', reason: 'Enrolled MFA factors; clearing locks out MFA users' },
  { collection: 'tblmfabackupcodes', reason: 'MFA recovery codes' },
  { collection: 'tbloauth_tokens', reason: 'Live OAuth tokens' },
  { collection: 'tblsubscriptions', reason: 'Billing subscription state' },
  { collection: 'tblusagerecords', reason: 'Billing usage history' },
];

/**
 * IGNORED. Present in some deployments, carrying nothing that matters
 * either way. Listed so the reconciliation below can be exhaustive
 * without forcing a judgement call on a legacy stub.
 */
const IGNORE: Entry[] = [
  { collection: 'admins', reason: 'Legacy empty collection superseded by tbladmin' },
];

// ── argument parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
function optionValue(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx === args.length - 1) return undefined;
  const value = args[idx + 1];
  // Windows CMD has no backslash line-continuation, so a stray "\" ends
  // up as an argument and silently swallows the next flag. Same guard
  // scripts/assign-tenant.ts already carries.
  if (!value || value.startsWith('--') || value === '\\') return undefined;
  return value;
}

const APPLY = has('--confirm');
const ALL_TENANTS = has('--yes-all-tenants');
const TENANT = optionValue('tenant');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(`${RED}MONGODB_URI is not set.${RESET}`);
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db: Db = client.db();

  try {
    await run(db);
  } finally {
    await client.close();
  }
}

async function run(db: Db) {
  const present = (await db.listCollections().toArray()).map((c) => c.name).sort();

  // ── reconciliation: every collection must be classified ───────────
  const classified = new Map<string, { list: string; reason: string }>();
  for (const e of CLEAR) classified.set(e.collection, { list: 'CLEAR', reason: e.reason });
  for (const e of PRESERVE) classified.set(e.collection, { list: 'PRESERVE', reason: e.reason });
  for (const e of IGNORE) classified.set(e.collection, { list: 'IGNORE', reason: e.reason });

  const unclassified = present.filter((c) => !classified.has(c) && !c.startsWith('system.'));

  if (unclassified.length > 0) {
    console.error(
      `\n${RED}${BOLD}REFUSING TO RUN: ${unclassified.length} collection(s) are not classified.${RESET}\n`
    );
    for (const c of unclassified) console.error(`  ${RED}?${RESET} ${c}`);
    console.error(
      `\n${DIM}Every collection must appear in CLEAR, PRESERVE or IGNORE in this script.\n` +
        `Defaulting either way is the dangerous option: defaulting to CLEAR silently deletes\n` +
        `a new customer-configured collection, and defaulting to PRESERVE silently leaves\n` +
        `operational data behind so the "reset" is not one. Add each collection above with a\n` +
        `reason and re-run.${RESET}\n`
    );
    process.exit(1);
  }

  // ── tenant scoping ────────────────────────────────────────────────
  const orgs = await db
    .collection('tblorganizations')
    .find({}, { projection: { slug: 1, name: 1, tenantId: 1 } })
    .toArray();

  const tenantIds = orgs.map((o) => String(o.tenantId ?? o.slug)).filter(Boolean);

  if (!TENANT && tenantIds.length > 1 && !ALL_TENANTS) {
    console.error(
      `\n${RED}${BOLD}REFUSING TO RUN: this database holds ${tenantIds.length} tenants and no --tenant was given.${RESET}\n`
    );
    for (const o of orgs) console.error(`  - ${o.name} ${DIM}(${o.tenantId ?? o.slug})${RESET}`);
    console.error(
      `\n${DIM}"Reset the business data" almost never means "for every customer at once".\n` +
        `Pass --tenant <slug>, or --yes-all-tenants if you genuinely mean all of them.${RESET}\n`
    );
    process.exit(1);
  }

  if (TENANT && !tenantIds.includes(TENANT)) {
    console.error(`\n${RED}No organization has tenantId/slug "${TENANT}".${RESET}`);
    console.error(`${DIM}Known: ${tenantIds.join(', ')}${RESET}\n`);
    process.exit(1);
  }

  const scope = TENANT ? { tenantId: TENANT } : {};
  const scopeLabel = TENANT ? `tenant ${BOLD}${TENANT}${RESET}` : `${BOLD}ALL TENANTS${RESET}`;

  console.log(`\n${BOLD}Business data reset${RESET} — ${scopeLabel}`);
  console.log(
    APPLY
      ? `${RED}${BOLD}MODE: APPLY — documents will be deleted.${RESET}`
      : `${GREEN}${BOLD}MODE: DRY RUN — nothing will be deleted. Pass --confirm to apply.${RESET}`
  );
  console.log(`${DIM}Collections are never dropped; indexes and validators survive.${RESET}\n`);

  // ── manifest ──────────────────────────────────────────────────────
  console.log(`${BOLD}DELETION MANIFEST${RESET}`);
  console.log(`${DIM}${'collection'.padEnd(38)} ${'docs'.padStart(9)}  reason${RESET}`);

  let totalToDelete = 0;
  const plan: Array<{ collection: string; count: number }> = [];

  for (const entry of CLEAR) {
    if (!present.includes(entry.collection)) continue;
    const count = await db.collection(entry.collection).countDocuments(scope);
    totalToDelete += count;
    plan.push({ collection: entry.collection, count });
    const colour = count > 0 ? YELLOW : DIM;
    console.log(
      `${colour}${entry.collection.padEnd(38)} ${String(count).padStart(9)}${RESET}  ${DIM}${entry.reason}${RESET}`
    );
  }

  console.log(`\n${BOLD}PRESERVED${RESET} ${DIM}(untouched)${RESET}`);
  for (const entry of PRESERVE) {
    if (!present.includes(entry.collection)) continue;
    const count = await db.collection(entry.collection).countDocuments(scope);
    console.log(
      `${GREEN}${entry.collection.padEnd(38)} ${String(count).padStart(9)}${RESET}  ${DIM}${entry.reason}${RESET}`
    );
  }

  console.log(
    `\n${BOLD}Total documents to delete: ${totalToDelete}${RESET} across ${plan.filter((p) => p.count > 0).length} collection(s).`
  );

  if (!APPLY) {
    console.log(`\n${GREEN}Dry run complete. Nothing was changed.${RESET}`);
    console.log(
      `${DIM}Re-run with --confirm to apply${TENANT ? '' : ' (and --tenant <slug> to scope it)'}.${RESET}\n`
    );
    return;
  }

  // ── apply ─────────────────────────────────────────────────────────
  console.log(`\n${RED}${BOLD}APPLYING…${RESET}`);
  let deleted = 0;
  const failures: string[] = [];

  for (const { collection, count } of plan) {
    if (count === 0) continue;
    try {
      const res = await db.collection(collection).deleteMany(scope);
      deleted += res.deletedCount ?? 0;
      console.log(`  ${GREEN}✓${RESET} ${collection.padEnd(38)} ${String(res.deletedCount).padStart(9)} deleted`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${collection}: ${message}`);
      console.log(`  ${RED}✗${RESET} ${collection.padEnd(38)} ${RED}${message}${RESET}`);
    }
  }

  // ── audit ─────────────────────────────────────────────────────────
  //
  // Written to the SAME collection every other repair script uses, so
  // "what happened to this database" has one answer rather than four.
  await db.collection('tbltenant_repair_audit').insertOne({
    at: new Date(),
    actor: 'scripts/reset-business-data.ts',
    action: 'BUSINESS_DATA_RESET',
    tenantId: TENANT ?? '(all tenants)',
    deletedCount: deleted,
    collections: plan.filter((p) => p.count > 0).map((p) => ({ collection: p.collection, count: p.count })),
    failures,
  });

  console.log(`\n${BOLD}Deleted ${deleted} documents.${RESET}`);
  if (failures.length > 0) {
    console.log(`${RED}${failures.length} collection(s) failed — see above.${RESET}`);
  }
  console.log(`${DIM}Recorded in tbltenant_repair_audit.${RESET}`);
  console.log(
    `\n${YELLOW}${BOLD}NEXT STEPS${RESET}\n` +
      `${DIM}  1. Log in and confirm your organization, branches, users and roles are intact.\n` +
      `  2. Re-enter vehicles FIRST — every operational record inherits its org unit from a vehicle.\n` +
      `  3. See DATA_ENTRY_GUIDE.md for the full entry order and why it matters.${RESET}\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${RED}Reset failed:${RESET}`, error);
    process.exit(1);
  });
}

export { CLEAR, PRESERVE, IGNORE };
