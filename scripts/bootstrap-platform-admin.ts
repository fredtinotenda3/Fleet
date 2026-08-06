// scripts/bootstrap-platform-admin.ts
//
// Creates or repairs a platform SUPER_ADMIN so you can always log in,
// including after the fail-closed auth change.
//
//   npx tsx scripts/bootstrap-platform-admin.ts --email you@example.com
//   npx tsx scripts/bootstrap-platform-admin.ts --email you@example.com --apply
//   npx tsx scripts/bootstrap-platform-admin.ts --email you@example.com --apply --set-password
//
// Dry run by default. `--apply` writes. `--set-password` additionally
// rotates the password and prints a generated one once.
//
// ---------------------------------------------------------------------
// Why a platform admin needs this
// ---------------------------------------------------------------------
// lib/authOptions.ts now refuses to log in an account with no tenantId,
// because `|| 'default'` was silently granting platform-wide read access
// to every legacy account. A genuine SUPER_ADMIN is a real exception to
// that rule: it is not scoped to any organization, and server/auth/
// auth-context.ts assigns it PLATFORM_SCOPE_TENANT_ID at authentication
// time rather than reading tenantId from the record.
//
// For that to work the account must carry the SUPER_ADMIN role in the
// `roles` ARRAY. auth-context.ts reads `roles`, not the older singular
// `Role` string. Several accounts in this database have
// `Role: 'super_admin'` with no `roles` array at all — those would be
// treated as ordinary users, fail the tenant check, and be locked out.
// This script reconciles the two representations.
//
// It does NOT grant platform admin to anyone not named on the command
// line, and it never touches any other account.

import { MongoClient, ObjectId } from 'mongodb';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { buildTenantIdentityIndex, resolveCanonical } from './lib/tenant-identity';

dotenv.config();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SET_PASSWORD = args.includes('--set-password');

function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
}

const email = argValue('--email');
const explicitPassword = argValue('--password');

/** 20 chars from a 64-symbol alphabet ~= 120 bits. */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = crypto.randomBytes(20);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function main() {
  if (!email) {
    console.error('Usage: tsx scripts/bootstrap-platform-admin.ts --email <address> [--apply] [--set-password]');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Aborting.');
    process.exit(1);
  }

  // bcrypt is a runtime dependency of the app; imported lazily so a dry
  // run still works if native bindings are unavailable.
  const bcrypt = SET_PASSWORD || explicitPassword ? await import('bcryptjs') : null;

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const admins = db.collection('tbladmin');

  console.log('='.repeat(72));
  console.log(`BOOTSTRAP PLATFORM ADMIN  --  ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);
  console.log(`Database: ${db.databaseName}`);
  console.log(`Target:   ${email}`);
  console.log('='.repeat(72));

  const identity = await buildTenantIdentityIndex(db);
  const existing = await admins.findOne({ Email: email });

  const desiredRoles = ['super_admin'];
  const changes: Array<{ field: string; from: unknown; to: unknown; why: string }> = [];
  let password: string | null = null;

  if (existing) {
    const currentRoles: string[] = Array.isArray(existing.roles)
      ? existing.roles.map(String)
      : [];

    console.log('');
    console.log('Existing account found.');
    console.log(`  _id ............. ${String(existing._id)}`);
    console.log(`  Role (legacy) ... ${existing.Role ?? '(none)'}`);
    console.log(`  roles (array) ... ${currentRoles.length ? currentRoles.join(', ') : '(none)'}`);
    console.log(`  tenantId ........ ${existing.tenantId ?? '(none)'}`);

    if (!currentRoles.includes('super_admin')) {
      changes.push({
        field: 'roles',
        from: currentRoles,
        to: [...new Set([...currentRoles, ...desiredRoles])],
        why: 'auth-context.ts reads the roles ARRAY; a legacy `Role` string alone is not recognised as platform admin',
      });
    }

    if (existing.Role !== 'super_admin') {
      changes.push({
        field: 'Role',
        from: existing.Role ?? null,
        to: 'super_admin',
        why: 'keep the legacy singular field consistent with roles[] for older code paths',
      });
    }

    // A platform admin should NOT carry an organization tenantId — its
    // scope comes from PLATFORM_SCOPE_TENANT_ID at auth time. A legacy
    // sentinel value is actively harmful and is cleared.
    const canonical = resolveCanonical(identity, existing.tenantId);
    if (existing.tenantId !== undefined && !canonical) {
      changes.push({
        field: 'tenantId',
        from: existing.tenantId,
        to: null,
        why: 'legacy sentinel or dangling value; a platform admin derives scope from its role, not from this field',
      });
    } else if (canonical) {
      console.log('');
      console.log(`  NOTE: this account is scoped to organization "${canonical}".`);
      console.log('        Leaving that intact — an org-scoped account with the');
      console.log('        SUPER_ADMIN role still resolves to platform scope at');
      console.log('        auth time, and clearing it would lose information.');
    }

    if (existing.permissions === undefined) {
      changes.push({
        field: 'permissions',
        from: null,
        to: ['*'],
        why: 'match the permission shape used by the other platform admin records',
      });
    }
  } else {
    console.log('');
    console.log('No account with that email. A new SUPER_ADMIN will be created.');
    if (!SET_PASSWORD && !explicitPassword) {
      console.log('');
      console.log('  A new account needs a password. Re-run with --set-password');
      console.log('  (generates one and prints it once) or --password <value>.');
      await client.close();
      process.exit(1);
    }
  }

  if (SET_PASSWORD || explicitPassword) {
    password = explicitPassword ?? generatePassword();
    changes.push({
      field: 'Password',
      from: '(unchanged)',
      to: '(bcrypt hash, cost 10)',
      why: explicitPassword ? 'password supplied on the command line' : 'password generated by --set-password',
    });
  }

  console.log('');
  if (changes.length === 0) {
    console.log('Nothing to change — this account is already a valid platform admin.');
    console.log('You can log in with it as-is.');
    await client.close();
    return;
  }

  console.log('PLANNED CHANGES:');
  for (const c of changes) {
    console.log(`  ${c.field}`);
    console.log(`      from: ${JSON.stringify(c.from)}`);
    console.log(`      to:   ${JSON.stringify(c.to)}`);
    console.log(`      why:  ${c.why}`);
  }

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN — nothing was written. Re-run with --apply to commit.');
    await client.close();
    return;
  }

  const set: Record<string, unknown> = {
    Role: 'super_admin',
    updatedAt: new Date(),
  };
  const unset: Record<string, ''> = {};

  const currentRoles: string[] = Array.isArray(existing?.roles) ? existing!.roles.map(String) : [];
  set.roles = [...new Set([...currentRoles, ...desiredRoles])];
  if (existing?.permissions === undefined) set.permissions = ['*'];

  for (const c of changes) {
    if (c.field === 'tenantId' && c.to === null) unset.tenantId = '';
  }

  if (password && bcrypt) {
    set.Password = await bcrypt.hash(password, 10);
  }

  if (existing) {
    await admins.updateOne(
      { _id: existing._id as ObjectId },
      Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set }
    );
    console.log('');
    console.log(`APPLIED: updated ${email}.`);
  } else {
    const doc = {
      Email: email,
      FirstName: email.split('@')[0],
      createdAt: new Date(),
      ...set,
    };
    const res = await admins.insertOne(doc as never);
    console.log('');
    console.log(`APPLIED: created ${email} (_id ${String(res.insertedId)}).`);
  }

  // Audit, using the same collection the repair script writes to.
  await db.collection('tbltenant_repair_audit').insertOne({
    at: new Date(),
    collection: 'tbladmin',
    documentId: existing ? String(existing._id) : '(new)',
    action: existing ? 'PLATFORM_ADMIN_REPAIRED' : 'PLATFORM_ADMIN_CREATED',
    email,
    changes: changes.map((c) => ({ field: c.field, from: c.from, to: c.to })),
    actor: 'scripts/bootstrap-platform-admin.ts',
  });

  if (password) {
    console.log('');
    console.log('  '.padEnd(2) + '-'.repeat(50));
    console.log(`  PASSWORD: ${password}`);
    console.log('  '.padEnd(2) + '-'.repeat(50));
    console.log('  Shown once and not stored anywhere in plaintext.');
    console.log('  Save it to your password manager now, then change it after');
    console.log('  your first login.');
  }

  console.log('');
  console.log('Log in at /login. As SUPER_ADMIN you resolve to platform scope,');
  console.log('so you will see data across all organizations by design.');

  await client.close();
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
