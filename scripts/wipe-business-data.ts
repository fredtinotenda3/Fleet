import { MongoClient } from 'mongodb';

const BUSINESS_COLLECTIONS = [
  'tblvehicles',
  'tbldrivers',
  'tbltrips',
  'tblfuellogs',
  'tblexpenses',
  'tblreminders',
  'tblmeterlogs',
  'tblworkorders',
  'tblworkshopbays',
  'tblstockmovements',
  'tblpurchaserequests',
  'tblpurchaseorders',
  'tblvendors',
  'tblslapolicies',
  'tblslatrackings',
  'tbldispatchjobs',
  'tblbookings',
  'tblnotifications',
  'tbltelematics',
  'tbltelematics_alerts',
  'tbltelematics_devices',
  'tbltelematics_eagletrack_links',
  'tbltelematics_eagletrack_triggers',
  'tbltelematics_eagletrack_config',
  'tbltelematics_cartrack_config',
  'tbltelematics_demo_state',
  'tbltelematics_geofence_states',
  'tblgeocode_cache',
  'tblattentionitems',
  'tblattention_dispatches',
  'tblanomalies',
  'tblallocationledger',
  'tblvalueledger',
  'tblglsubmissions',
  'tbldepreciationprofiles',
  'tblcompliancerecords',
  'tbldvirinspections',
  'tblreportexecutions',
  'tblworkflow_instances',
];

async function main() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is not set. Refusing to run.');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  for (const name of BUSINESS_COLLECTIONS) {
    const col = db.collection(name);

    if (dryRun) {
      const count = await col.countDocuments({});
      console.log(`[dry-run] ${name}: ${count} row(s) would be deleted`);
      continue;
    }

    const result = await col.deleteMany({});
    console.log(`Deleted ${result.deletedCount} row(s) from ${name}`);
  }

  await client.close();
  console.log(dryRun ? 'Dry run complete. No data deleted.' : 'Business data wipe complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});