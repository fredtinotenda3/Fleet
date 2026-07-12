// C:\Users\user\Desktop\Fleet\app\api\vehicles\direct\route.ts
//
// FIX (🔴 Critical): this route opened its own raw MongoClient
// connection and inserted vehicles directly into tblvehicles,
// completely bypassing:
//   - modules/vehicles/controllers/vehicle.controller.ts's Zod
//     validation (vehicleCreateSchema)
//   - the tenant-scoped repository (every vehicle it created was
//     hardcoded to tenantId: 'default', regardless of which
//     organization the caller actually belonged to)
//   - the CQRS command/audit pipeline every other vehicle write goes
//     through
//
// There is no legitimate reason for a second, unvalidated,
// tenant-unaware vehicle-creation path to exist alongside
// app/api/vehicles/route.ts's POST handler, which already does this
// correctly via vehicleController.createVehicle. Rather than patch
// this into a second parallel implementation of vehicle creation
// (more duplication, more drift risk), this endpoint is retired.
//
// Any caller depending on POST /api/vehicles/direct should switch to
// POST /api/vehicles (see app/api/vehicles/route.ts), which enforces
// Permission.VEHICLE_CREATE, tenant scoping, and schema validation.
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint has been removed. Use POST /api/vehicles instead.',
      code: 'ENDPOINT_RETIRED',
    },
    { status: 410 }
  );
}