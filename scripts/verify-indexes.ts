// scripts/verify-indexes.ts
import connectToDatabase from '../infrastructure/database/mongodb';

async function verify() {
  const db = await connectToDatabase();

  const checks = [
    { col: 'tbltelematics', idx: 'idx_telematics_tenant_vehicle_ts' },
    { col: 'tblusersessions', idx: 'idx_session_userid' },          // adjust if name differs
    { col: 'tblrefreshtokens', idx: 'idx_refreshtoken_token' },    // adjust if needed
    { col: 'tblmfafactors', idx: 'idx_mfa_factor_user_status' },
    { col: 'tblfuellogs', idx: 'idx_fuel_tenant_plate_date' },
    { col: 'tblvehicles', idx: 'idx_vehicle_tenant_plate' },
  ];

  for (const { col, idx } of checks) {
    const indexes = await db.collection(col).indexes();
    const found = indexes.find((i: any) => i.name === idx);
    console.log(`${col.padEnd(25)} ${idx.padEnd(38)} : ${found ? '✓ EXISTS' : '✗ MISSING'}`);
    if (!found && indexes.length > 0) {
      console.log(`   (existing indexes: ${indexes.map((i: any) => i.name).join(', ')})`);
    }
  }

  console.log('\nVerification complete.');
  process.exit(0);
}

verify().catch((err) => {
  console.error('Verification error:', err.message);
  process.exit(1);
});