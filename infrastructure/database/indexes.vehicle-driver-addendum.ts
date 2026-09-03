// infrastructure/database/indexes.vehicle-driver-addendum.ts
//
// Backs PATCH /api/vehicles/:id/driver (modules/vehicles/commands/
// handlers/assign-vehicle-driver.handler.ts).
//
// BUSINESS RULE encoded here (see the full explanation on
// Vehicle.currentDriverId in shared/types/vehicle.types.ts): a driver
// may be the CURRENT driver of at most one vehicle at a time. The
// handler already enforces this in application code (it unassigns a
// driver from any other vehicle before assigning them here), so this
// index is a database-level backstop against the same race every other
// "enforce uniqueness" index in this codebase guards against (e.g.
// idx_vehicle_tenant_plate) -- two concurrent requests assigning the
// same driver to two different vehicles must not both succeed.
//
// Scoped (not a plain unique index) for the same reason
// idx_vehicle_tenant_plate is: most vehicles have NO current driver at
// any given time, and unassigned should never collide with unassigned.
// The partial filter restricts uniqueness to documents where
// currentDriverId actually holds a driver id string, so any number of
// vehicles can simultaneously have no driver, and a soft-deleted
// vehicle's old assignment does not block reuse of that driver
// elsewhere.
export const VEHICLE_DRIVER_INDEXES = {
  tblvehicles: [
    {
      key: { tenantId: 1, currentDriverId: 1 },
      name: 'idx_vehicle_tenant_currentdriver',
      unique: true,
      partialFilterExpression: {
        currentDriverId: { $type: 'string' },
        isDeleted: false,
      },
    },
  ],
} as const;
