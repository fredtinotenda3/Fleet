// modules/telematics/services/telematics-scope.utils.ts
//
// "May this caller act on this vehicle" -- one definition, for every
// Eagle Track endpoint that takes a vehicleId from an HTTP request.
//
// ---------------------------------------------------------------------
// WHY THIS IS SHARED RATHER THAN COPIED
// ---------------------------------------------------------------------
// server/utils/tenant-context.utils.ts opens with the reason: before it
// existed, resolveTenantContext was three byte-identical private copies,
// and every copy is a place where somebody can "fix" a 403 by loosening
// the check for one module and have the divergence be invisible in
// review. This is the same shape of function -- a security boundary that
// four new endpoints all need -- so it gets the same treatment.
//
// ---------------------------------------------------------------------
// FAIL CLOSED, INCLUDING THE UNASSIGNED CASE
// ---------------------------------------------------------------------
// The architecture rule is "fail closed when ownership cannot be
// established", and the case that actually tests it is a vehicle with NO
// orgUnitId. There are two tempting readings:
//
//   * "unassigned means shared, so everyone may see it" -- which is what
//     getActiveGeofencesInScope does for GEOFENCES, deliberately,
//     because a depot boundary with no owner is genuinely shared
//     reference data.
//   * "unassigned means ownership is unknown, so refuse" -- which is
//     what every VEHICLE-derived read in this product already does,
//     because tenantScopeService.buildFilter emits a bare
//     `{ orgUnitId: { $in: [...] } }` with no unassigned branch.
//
// A vehicle is not shared reference data. It is owned by exactly one
// branch; if nobody has recorded which, that is missing information, not
// permission. So this refuses, and the fix for an operator hitting it is
// to assign the vehicle -- not to loosen the predicate. Refusing also
// keeps this helper consistent with the repository reads that run
// afterwards, which would return nothing anyway: a check that said yes
// where the subsequent query says no would produce an endpoint that
// authorises a caller and then hands them an empty result.
//
// Org-wide callers (accessibleOrgUnitIds === null) are unaffected.

import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { NotFoundError } from '@/server/errors/app.errors';

/** A vehicle the caller has been confirmed to own, with everything the telematics services need from it. */
export interface ScopedVehicle {
  vehicleId: string;
  tenantId: string;
  licensePlate: string;
  orgUnitId?: string;
}

/**
 * Resolves a vehicleId to a vehicle the caller may act on, or throws.
 *
 * Throws NotFoundError -- not ForbiddenError -- for an out-of-scope
 * vehicle. That is the established convention here (Phase G: "out-of-
 * scope single reads return 404 not 403") and it is the right one: a 403
 * confirms the vehicle exists, which tells a caller probing ids
 * something about another branch's fleet.
 */
export async function assertVehicleInScope(
  vehicleId: string,
  context: TenantContext
): Promise<ScopedVehicle> {
  const vehicle = await vehicleRepository.findById(vehicleId, context.organizationId);
  if (!vehicle?._id) {
    throw new NotFoundError('Vehicle not found');
  }

  if (context.accessibleOrgUnitIds !== null) {
    // See the header: unassigned is refused, not treated as shared.
    if (!vehicle.orgUnitId || !context.accessibleOrgUnitIds.includes(vehicle.orgUnitId)) {
      throw new NotFoundError('Vehicle not found');
    }
  }

  return {
    vehicleId: String(vehicle._id),
    tenantId: context.organizationId,
    licensePlate: vehicle.license_plate,
    ...(vehicle.orgUnitId ? { orgUnitId: vehicle.orgUnitId } : {}),
  };
}
