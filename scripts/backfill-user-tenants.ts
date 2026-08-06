// scripts/backfill-user-tenants.ts
//
// ⚠️  SUPERSEDED — DO NOT USE. This script is intentionally disabled.
//
// It contained a data-corrupting bug that only surfaced when it was run
// against the real database:
//
//   It resolved each account's organization to `String(org._id)` — an
//   ObjectId hex string — and would have written that to
//   tbladmin.tenantId. But the canonical tenant identifier in this
//   database is the organization SLUG:
//
//       tblorganizations: { tenantId: "willsgrove-farm-enterprises-9e80ed" }
//       tblvehicles:      { tenantId: "willsgrove-farm-enterprises-9e80ed" }
//       tbladmin:         { tenantId: "toyota-zimbabwe-949d94" }
//
//   Had `--apply` been run, the "repaired" accounts would have carried a
//   tenantId that matches NO business row. They would have logged in
//   successfully and seen a completely empty fleet — a silent, confusing
//   failure that is considerably worse than being locked out, and one
//   that looks like data loss to the customer.
//
//   Only the dry-run default prevented this.
//
// Replacement: scripts/tenant-data-repair.ts
//   - resolves identity through scripts/lib/tenant-identity.ts, which
//     accepts slug / tenantId / _id and always writes the canonical form
//   - adds two recoverability ladders this script never had (parent
//     record, and inbound usage references)
//   - classifies RECOVERABLE / NEEDS_REVIEW / UNRECOVERABLE
//   - exports unrecoverable rows before any write
//   - audits every modification to tbltenant_repair_audit
//
// This file is kept rather than deleted so that anyone following an older
// runbook (including DEPLOYMENT.md revision 1, or the CI production job)
// gets a loud, specific explanation instead of a "command not found".

/* eslint-disable no-console */

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

console.error('');
console.error(`${RED}================================================================${RESET}`);
console.error(`${RED} db:backfill-user-tenants is DISABLED${RESET}`);
console.error(`${RED}================================================================${RESET}`);
console.error('');
console.error(' This script had a bug that would have written ObjectId hex to');
console.error(' tbladmin.tenantId, where the canonical identifier is the');
console.error(' organization SLUG. Affected accounts would have logged in and');
console.error(' seen an empty fleet.');
console.error('');
console.error(`${YELLOW} Use instead:${RESET}`);
console.error('');
console.error('   npm run db:repair            # dry run, writes nothing');
console.error('   npm run db:repair:apply      # commit the reviewed plan');
console.error('');
console.error(' See CHANGELOG.md and DEPLOYMENT.md for the corrected sequence.');
console.error('');

process.exit(1);
