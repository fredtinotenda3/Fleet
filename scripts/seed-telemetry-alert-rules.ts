// scripts/seed-telemetry-alert-rules.ts
//
// WAVE 2 -- creates the three Rule documents that reproduce
// reading-alerts.ts's hardcoded conditions for one tenant, so
// TELEMETRY_RULE_ENGINE_ENABLED=true has something real to evaluate.
//
// This does NOT flip the flag. Turning TELEMETRY_RULE_ENGINE_ENABLED on
// for a tenant with no rules seeded would silently stop alerting for
// that tenant (fireTrigger finds zero active rules and does nothing) --
// exactly the kind of "quiet loss of function" this codebase has
// repeatedly had to fix elsewhere (see alert-ownership.resolver.ts's own
// header). Seed first, verify with the parity suite / a dry run against
// real recent readings, THEN flip the flag.
//
// IDEMPOTENT: matches existing rules by (tenantId, trigger, name) and
// skips ones that already exist, so re-running after a partial failure
// or to pick up a new tenant is safe. It does not update an existing
// rule's conditions/actions -- an operator who already customised one of
// these three rules keeps their edit; this script only fills gaps.
//
// USAGE:
//   npx tsx scripts/seed-telemetry-alert-rules.ts --tenant <organizationId> [--user <userId>] [--apply]
//
//   Without --apply this is a dry run: it prints what would be created
//   and creates nothing.

import 'dotenv/config';
import { ruleRepository } from '@/modules/rules/repositories/rule.repository';
import { Rule } from '@/modules/rules/types/rule.types';
import { TELEMETRY_READING_INGESTED_TRIGGER } from '@/modules/telematics/services/telemetry-rule-context';
import { TELEMETRY_ALERT_RULE_DEFINITIONS } from '@/modules/telematics/services/telemetry-alert-rules.definitions';

function getArgValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const TENANT_ID = getArgValue('--tenant');
const SEED_USER_ID = getArgValue('--user') || 'system';
const APPLY = process.argv.includes('--apply');

// Definitions live in telemetry-alert-rules.definitions.ts, imported
// unchanged, so this script and the parity test suite
// (tests/security/telemetry-rule-engine-parity.spec.ts) can never seed
// or test a rule shape that has silently drifted from the other.
const SEED_RULES = TELEMETRY_ALERT_RULE_DEFINITIONS;

async function run(): Promise<void> {
  if (!TENANT_ID) {
    console.error('Usage: npx tsx scripts/seed-telemetry-alert-rules.ts --tenant <organizationId> [--user <userId>] [--apply]');
    process.exit(1);
  }

  const existing = await ruleRepository.getRules(TENANT_ID, { trigger: TELEMETRY_READING_INGESTED_TRIGGER });
  const existingNames = new Set(existing.map((r) => r.name));

  for (const def of SEED_RULES) {
    if (existingNames.has(def.name)) {
      console.log(`[skip] "${def.name}" already exists for tenant ${TENANT_ID}`);
      continue;
    }

    const payload: Omit<Rule, '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'> = {
      name: def.name,
      description: def.description,
      category: def.category,
      trigger: TELEMETRY_READING_INGESTED_TRIGGER,
      conditions: def.conditions,
      actions: [{ type: 'create_telemetry_alert', params: def.actionParams }],
      priority: def.priority,
      // Created inactive: an operator reviews and activates explicitly,
      // mirroring the maintenance module's own "clone starts in draft"
      // convention (rule.repository.ts's duplicateRule). A seed script
      // must not silently make a tenant's rules live.
      status: 'draft',
      version: 1,
      stopOnMatch: false,
      tags: ['wave-2', 'telemetry-migration'],
    };

    if (!APPLY) {
      console.log(`[dry run] would create "${def.name}" for tenant ${TENANT_ID} (status: draft)`);
      continue;
    }

    const created = await ruleRepository.createRule(payload, TENANT_ID, SEED_USER_ID);
    console.log(`[created] "${def.name}" (${created._id}) for tenant ${TENANT_ID}, status: draft`);
  }

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to create the rules above (still status: draft).');
  } else {
    console.log(
      '\nRules created in DRAFT status. Activate them (status: active) only after the parity suite has ' +
        'passed for this tenant and TELEMETRY_RULE_ENGINE_ENABLED=true has been reviewed for this environment.'
    );
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to seed telemetry alert rules:', error);
    process.exit(1);
  });
