// diagnose-login.ts
import 'dotenv/config';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { compare } from 'bcryptjs';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: tsx diagnose-login.ts <email>');
    process.exit(1);
  }

  const db = await connectToDatabase();
  const admin = await db.collection('tbladmin').findOne({ Email: email.toLowerCase() });

  if (!admin) {
    console.log(`❌ No account found for "${email.toLowerCase()}".`);
    console.log('   Check spelling or re-run provisioning.');
    process.exit(1);
  }

  console.log('✅ Account found:');
  console.log(`   _id      : ${admin._id}`);
  console.log(`   Email    : ${admin.Email}`);
  console.log(`   Password : ${admin.Password.substring(0, 30)}... (bcrypt hash)`);

  // Check lock status (common collection name)
  let lock = await db.collection('tblthreatlock').findOne({ email: admin.Email });
  if (!lock) {
    lock = await db.collection('loginattempts').findOne({ email: admin.Email }) || null;
    if (lock) console.log('⚠️  Found lock record in "loginattempts"');
  } else {
    console.log('⚠️  Found lock record in "tblthreatlock"');
  }

  if (lock) {
    console.log('   Account is LOCKED. Unlock with:');
    console.log(`   db.tblthreatlock.deleteMany({ email: "${admin.Email}" })`);
    console.log(`   db.loginattempts.deleteMany({ email: "${admin.Email}" })`);
    console.log('   Then restart the dev server and try again.');
  } else {
    console.log('   Account is not locked.');

    const testPassword = await compare('U5d4Mwm8a6gD!7', admin.Password);
    console.log(`   Test password check (U5d4Mwm8a6gD!7): ${testPassword ? '✅ MATCH' : '❌ FAIL'}`);

    if (!testPassword) {
      console.log('❌ Password hash does NOT match the provided password.');
      console.log('   The provisioning script may have stored a different hash.');
      console.log('   Re-run provisioning or reset the password manually.');
    } else {
      console.log('✅ Password is correct. The issue might be something else (check server logs).');
    }
  }

  await db.client.close();
}

main().catch(console.error);