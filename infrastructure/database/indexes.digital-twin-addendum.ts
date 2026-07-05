// infrastructure/database/indexes.digital-twin-addendum.ts

import { Db } from 'mongodb';

export async function ensureDigitalTwinIndexes(db: Db): Promise<void> {
  const collection = db.collection('tblvehicledigitaltwins');

  await Promise.all([
    collection.createIndex({ tenantId: 1, vehicleId: 1 }, { unique: true, name: 'twin_tenant_vehicle_unique' }),
    collection.createIndex({ tenantId: 1, license_plate: 1 }, { name: 'twin_tenant_plate' }),
    collection.createIndex({ tenantId: 1, 'currentState.status': 1 }, { name: 'twin_tenant_status' }),
    collection.createIndex({ tenantId: 1, updatedAt: -1 }, { name: 'twin_tenant_updated' }),
    collection.createIndex({ tenantId: 1, 'alerts.acknowledged': 1, 'alerts.severity': 1 }, { name: 'twin_tenant_alerts' }),
  ]);
}