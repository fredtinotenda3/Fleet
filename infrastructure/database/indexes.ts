// infrastructure/database/indexes.ts

export const INDEXES = {
  vehicles: [
    { key: { tenantId: 1, license_plate: 1 }, unique: true },
    { key: { tenantId: 1, status: 1, isDeleted: 1 } },
    { key: { tenantId: 1, make: 1, model: 1 } },
    { key: { tenantId: 1, createdAt: -1 } },
  ],
  expenses: [
    { key: { tenantId: 1, license_plate: 1, date: -1 } },
    { key: { tenantId: 1, expense_type_id: 1 } },
    { key: { tenantId: 1, date: -1 } },
    { key: { tenantId: 1, amount: 1 } },
  ],
  fuel_logs: [
    { key: { tenantId: 1, license_plate: 1, date: -1 } },
    { key: { tenantId: 1, date: -1 } },
    { key: { tenantId: 1, unit_id: 1 } },
  ],
  reminders: [
    { key: { tenantId: 1, license_plate: 1, due_date: 1 } },
    { key: { tenantId: 1, status: 1, due_date: 1 } },
    { key: { tenantId: 1, assigned_to: 1, status: 1 } },
  ],
  trips: [
    { key: { tenantId: 1, license_plate: 1, date: -1 } },
    { key: { tenantId: 1, date: -1 } },
    { key: { tenantId: 1, driver_id: 1 } },
  ],
  telematics: [
    { key: { tenantId: 1, vehicleId: 1, timestamp: -1 } },
    { key: { tenantId: 1, deviceId: 1, timestamp: -1 } },
    { key: { timestamp: -1 }, expireAfterSeconds: 2592000 }, // 30 days TTL
  ],
  organizations: [
    { key: { slug: 1 }, unique: true },
    { key: { ownerId: 1 } },
    { key: { 'members.userId': 1 } },
  ],
  notifications: [
    { key: { tenantId: 1, userId: 1, sentAt: -1 } },
    { key: { tenantId: 1, userId: 1, read: 1 } },
    { key: { sentAt: -1 }, expireAfterSeconds: 7776000 }, // 90 days TTL
  ],
  workflow_instances: [
    { key: { tenantId: 1, entityId: 1, entityType: 1 } },
    { key: { tenantId: 1, status: 1, createdAt: 1 } },
    { key: { tenantId: 1, 'steps.assignedTo': 1, 'steps.status': 1 } },
  ],
};

async function ensureIndexes() {
  const db = await connectToDatabase();
  
  for (const [collectionName, indexes] of Object.entries(INDEXES)) {
    const collection = db.collection(collectionName);
    for (const index of indexes) {
      await collection.createIndex(index.key, index);
    }
  }
}