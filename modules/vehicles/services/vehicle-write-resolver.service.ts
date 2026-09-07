// modules/vehicles/services/vehicle-write-resolver.service.ts
//
// The ONE place a write path turns a caller-supplied `license_plate`
// into a vehicle.
//
// Background and the three defects this replaces are documented in
// server/tenancy/write-scope.ts. In short: ten handlers each ran their
// own unscoped `db.collection('tblvehicles').findOne({ license_plate })`
// and then inherited that vehicle's `orgUnitId` onto the record being
// written.
//
// This service is deliberately thin. It does not re-implement lookup --
// it delegates to vehicleIdentityResolver, which already handles the
// tenant boundary and the ambiguous-plate case and is already tested.
// What this adds is the WRITE-side policy that resolver deliberately
// left to its callers:
//
//   - which failures are 400 and which are 409
//   - that an out-of-scope vehicle is reported identically to a missing
//     one, so a scope-narrowed caller cannot use the error to enumerate
//     plates in another branch
//   - that the org unit a new record inherits comes from the VEHICLE,
//     resolved under scope, and never from the request body
//
// ---------------------------------------------------------------------
// Why the record inherits the vehicle's org unit rather than the
// submitter's
// ---------------------------------------------------------------------
// Both rules exist in this codebase and they disagree:
//
//   - resolveCreationOrgUnitId() files a record under the SUBMITTER's
//     own unit. Correct for records with no asset -- a driver, a
//     workshop bay.
//   - fuel / expense / trip / maintenance / work order / DVIR inherit
//     the VEHICLE's unit.
//
// For anything keyed to a vehicle the vehicle's unit is the right
// answer, because that is the unit whose cost-per-km, utilisation and
// maintenance history the record belongs to. If a Harare accountant
// files a cost for a Bulawayo truck, the cost is Bulawayo's; attributing
// it to Harare because Harare typed it in would corrupt both branches'
// financials. This service keeps that rule, and adds the check the rule
// always needed: the submitter must be allowed to touch that vehicle at
// all.
//
// This is why an out-of-scope vehicle is refused rather than silently
// re-attributed to the caller's own unit. Silently rewriting it would
// produce a plausible, wrong number in a ledger someone reconciles.

import { AppError } from '@/server/errors/app.errors';
import { Vehicle } from '@/shared/types/vehicle.types';
import { WriteScope, tenantIdOf, accessibleOrgUnitIdsOf } from '@/server/tenancy/write-scope';
import { vehicleIdentityResolver } from './vehicle-identity-resolver.service';

/**
 * Error code for a plate that resolves to more than one active vehicle.
 * Distinct from VEHICLE_NOT_FOUND on purpose: not-found is the caller's
 * typo to fix, ambiguous is the operator's data to fix, and telling them
 * apart is the difference between "check the plate" and "two vehicles in
 * your fleet share this plate".
 */
export const VEHICLE_PLATE_AMBIGUOUS = 'VEHICLE_PLATE_AMBIGUOUS';

/**
 * True when `vehicle` may be written against under `scope`.
 *
 * Mirrors tenantScopeService.buildFilter's fail-closed rule exactly, so
 * that what a user can WRITE against can never be wider than what the
 * same user can READ:
 *   - not narrowed (org-wide role, or a system write): everything
 *     in-tenant
 *   - narrowed: the vehicle must carry an orgUnitId AND that unit must
 *     be in the accessible set. A vehicle with no orgUnitId of its own
 *     is invisible to a narrowed reader, so it must also be unwritable
 *     by one -- otherwise a branch manager could post costs against a
 *     vehicle they cannot see.
 */
function isWritable(vehicle: Vehicle, scope: WriteScope): boolean {
  const accessible = accessibleOrgUnitIdsOf(scope);
  if (accessible === null) return true;
  if (!vehicle.orgUnitId) return false;
  return accessible.includes(vehicle.orgUnitId);
}

export class VehicleWriteResolver {
  /**
   * Resolve the vehicle a write is being filed against.
   *
   * @throws AppError VEHICLE_NOT_FOUND (400) when the plate matches no
   *   active vehicle in this tenant, OR matches one the caller is not
   *   scoped to. The two cases are deliberately indistinguishable to
   *   the caller: a distinguishable "exists but forbidden" response
   *   would let a scope-narrowed user enumerate another branch's fleet
   *   one plate at a time. This is the same rule
   *   vehicle-identity-resolver.service.ts documents for reads.
   * @throws AppError VEHICLE_PLATE_AMBIGUOUS (409) when two or more
   *   active vehicles in this tenant carry the plate. Never guesses.
   */
  async resolveForWrite(
    licensePlate: string | null | undefined,
    scope: WriteScope
  ): Promise<Vehicle> {
    const raw = typeof licensePlate === 'string' ? licensePlate.trim() : '';
    const display = raw || String(licensePlate ?? '');

    const result = await vehicleIdentityResolver.resolveByPlate(raw, tenantIdOf(scope));

    if (result.status === 'ambiguous') {
      throw new AppError(
        `More than one active vehicle carries the plate "${display}". ` +
          'Resolve the duplicate in Vehicles before recording against it.',
        VEHICLE_PLATE_AMBIGUOUS,
        409,
        { license_plate: display, matches: result.count }
      );
    }

    if (result.status === 'not_found' || !isWritable(result.vehicle, scope)) {
      throw new AppError(`Vehicle "${display}" not found`, 'VEHICLE_NOT_FOUND', 400);
    }

    return result.vehicle;
  }

  /**
   * The org unit a record filed against `vehicle` belongs to.
   *
   * Returns undefined (not null) when the vehicle itself has no unit,
   * so callers can spread it conditionally and leave the field absent
   * rather than writing an explicit null -- `{ orgUnitId: null }` and a
   * missing field behave differently under
   * `tenantScopeService.buildFilter`'s `$in` and under the
   * `{ orgUnitId: { $exists: true } }` branch the notifications
   * repository uses.
   */
  orgUnitIdFor(vehicle: Vehicle): string | undefined {
    return vehicle.orgUnitId ?? undefined;
  }
}

export const vehicleWriteResolver = new VehicleWriteResolver();
