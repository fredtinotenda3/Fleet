// diagnose-login.ts
//
// FIX: this script previously hardcoded a test password belonging to a
// different account entirely, and guessed lockout collection names
// ('tblthreatlock' / 'loginattempts') that don't exist in this codebase
// -- the real ones, per modules/security/repositories/login-attempt.
// repository.ts, are 'tblloginattempts' / 'tblaccountlockouts', and
// every lockout/attempt record is keyed by tenantId: 'default'
// UNCONDITIONALLY (modules/security/controllers/token.controller.ts
// calls threatDetectionService.isLocked(email, 'default') and
// recordLoginAttempt({..., tenantId: 'default'}) regardless of the
// account's real tenant -- confirmed by reading that controller, not
// assumed). Querying the wrong collection names meant this script could
// only ever report "not locked", whether or not that was true.
//
// Also now prints the account's resolved tenantId explicitly, since
// token.controller.ts falls back to the literal string 'default' when
// tbladmin.tenantId is unset -- a real, separate bug (see
// scripts/seed-olivine-org.ts's header) that logs an owner in
// successfully but scoped to the wrong tenant. A password check alone
// can't surface that; this script now can.
//
// Usage:
//   npx tsx diagnose-login.ts <email> <password>

import 'dotenv/config';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { compare } from 'bcryptjs';

const LEGACY_SENTINELS = new Set(['default', 'system', 'super_admin']);

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: npx tsx diagnose-login.ts <email> <password>');
    console.error('(the same email/password you are typing into the login form -- quote the password if it has special characters)');
    process.exit(1);
  }

  const db = await connectToDatabase();
  const normalizedEmail = email.toLowerCase();
  const admin = await db.collection('tbladmin').findOne({ Email: normalizedEmail });

  if (!admin) {
    console.log(`❌ No account found for "${normalizedEmail}" in the database this app is currently connected to.`);
    console.log('   Check spelling, check MONGODB_URI in .env points at the database you provisioned against,');
    console.log('   or re-run the provisioning script.');
    await db.client.close();
    process.exit(1);
  }

  console.log('✅ Account found:');
  console.log(`   _id       : ${admin._id}`);
  console.log(`   Email     : ${admin.Email}`);
  console.log(`   Password  : ${String(admin.Password).substring(0, 30)}... (bcrypt hash)`);

  const rawTenantId = admin.tenantId;
  const tenantIdIsUsable =
    typeof rawTenantId === 'string' && rawTenantId.trim().length > 0 && !LEGACY_SENTINELS.has(rawTenantId.trim().toLowerCase());

  if (!tenantIdIsUsable) {
    console.log(`   tenantId  : ${rawTenantId === undefined ? '(not set)' : JSON.stringify(rawTenantId)}  ⚠️`);
    console.log(
      "   ⚠️  This account's tenantId is missing or a legacy sentinel. token.controller.ts will fall back"
    );
    console.log(
      "       to the literal string 'default' at login -- the account WILL be able to log in, but scoped"
    );
    console.log(
      '       to the wrong tenant (an empty bucket, or worse, one shared with any other account in the same state).'
    );
    console.log(`   Fix with: ${'\x1b[36m'}npm run db:repair${'\x1b[0m'}  (dry run) then ${'\x1b[36m'}npm run db:repair:apply${'\x1b[0m'}`);
  } else {
    console.log(`   tenantId  : ${rawTenantId}  ✅`);
  }

  const lockout = await db.collection('tblaccountlockouts').findOne({ email: normalizedEmail, tenantId: 'default' });
  const lockedUntil = lockout?.lockedUntil ? new Date(lockout.lockedUntil) : null;
  const isLocked = !!lockedUntil && lockedUntil.getTime() > Date.now();

  if (isLocked) {
    console.log(`⚠️  Account is LOCKED until ${lockedUntil!.toISOString()}.`);
    console.log('   Clear it with:');
    console.log(
      `   db.tblaccountlockouts.updateOne({ email: "${normalizedEmail}", tenantId: "default" }, { $set: { failedCount: 0, lockedUntil: null } })`
    );
  } else {
    if (lockout) {
      console.log(`   Lockout record exists but is not currently active (failedCount: ${lockout.failedCount ?? 0}).`);
    } else {
      console.log('   Account is not locked.');
    }

    const passwordMatches = await compare(password, admin.Password);
    console.log(`   Password check: ${passwordMatches ? '✅ MATCH' : '❌ DOES NOT MATCH the stored hash'}`);

    if (!passwordMatches) {
      console.log('❌ This is why login is returning 401: the password does not match the stored hash.');
      console.log('   If this account was created by a seed script and later re-run, the printed credential');
      console.log('   from that later run may not be what was actually stored on first creation (fixed in the');
      console.log('   current scripts/seed-olivine-org.ts, which now resets the password on every run --');
      console.log('   re-run it to get a credential guaranteed to match).');
    } else if (isLocked) {
      console.log('✅ Password is correct, but the account is locked (see above) -- that is why login fails.');
    } else if (!tenantIdIsUsable) {
      console.log('✅ Password is correct and the account is not locked -- login should SUCCEED, but will');
      console.log('   resolve to the wrong tenant until the tenantId issue above is fixed. This is not a 401.');
    } else {
      console.log('✅ Password is correct, account is not locked, and tenantId is usable.');
      console.log('   If login is still failing, check the server logs for the exact error (not just the status code).');
    }
  }

  await db.client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
