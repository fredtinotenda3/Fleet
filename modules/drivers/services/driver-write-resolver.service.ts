// modules/drivers/services/driver-write-resolver.service.ts
//
// The ONE place a write path turns a caller-supplied `driver_id` into a
// driver.
//
// ---------------------------------------------------------------------
// WHY THIS EXISTS
// ---------------------------------------------------------------------
// The vehicle side of this problem was solved last round
// (vehicle-write-resolver.service.ts). The driver side had the same
// three defects and no equivalent seam:
//
//   1. NO CHECK AT ALL on the fuel path. `driver_id` never reached the
//      database, so nothing had ever needed to validate it -- see
//      shared/validations/fuel.schema.ts for how it was dropped.
//   2. A RAW `findOne({ _id: driver_id as any })` on the trip path,
//      comparing a STRING against an ObjectId `_id`. Fixed last round
//      by routing through driverRepository.findById, but only for
//      trips, and only for the tenant boundary.
//   3. NO ORG-UNIT CHECK anywhere. A branch manager could name a driver
//      belonging to another branch, and the record filed against that
//      driver would then appear in the other branch's scorecard,
//      cost-per-driver and risk figures -- written by someone who
//      cannot see that branch at all.
//
// Defect 3 is the one that matters for a multi-branch customer, and it
// is exactly the gap the vehicle resolver closed. Rather than repair two
// call sites in two different ways, both now go through here.
//
// ---------------------------------------------------------------------
// STATUS IS DELIBERATELY NOT A GATE
// ---------------------------------------------------------------------
// A suspended or inactive driver can still be named on a record. A fuel
// log is a statement of fact about who fuelled a vehicle, and history
// does not stop being true when someone is later suspended -- refusing
// the write would make it impossible to record last month's refuel for a
// driver suspended yesterday, or to import a historical spreadsheet at
// all. Whether a suspended driver may be DISPATCHED is a separate
// question, enforced where dispatch happens, not here.

import { AppError } from '@/server/errors/app.errors';
import { Driver } from '@/shared/types/driver.types';
import { WriteScope, tenantIdOf, accessibleOrgUnitIdsOf } from '@/server/tenancy/write-scope';
import { driverRepository } from '../repositories/driver.repository';

/**
 * True when `driver` may be named by a write under `scope`.
 *
 * Mirrors vehicle-write-resolver's `isWritable` and, through it,
 * tenantScopeService.buildFilter's fail-closed rule, so what a user can
 * WRITE against is never wider than what the same user can READ:
 *   - not narrowed (org-wide role, or a system write): everything
 *     in-tenant
 *   - narrowed: the driver must carry an orgUnitId AND that unit must
 *     be in the accessible set. A driver with no orgUnitId is invisible
 *     to a narrowed reader, so a narrowed writer must not be able to
 *     attribute costs to them either.
 *
 * The second rule is why `npm run tenancy:backfill` matters before this
 * is deployed onto a database that predates org-unit scoping: drivers
 * written without an orgUnitId become unnameable by narrowed users until
 * they have one. On a freshly reset database every driver is written
 * with a unit, so this is only a concern for legacy data.
 */
function isWritable(driver: Driver, scope: WriteScope): boolean {
  const accessible = accessibleOrgUnitIdsOf(scope);
  if (accessible === null) return true;
  if (!driver.orgUnitId) return false;
  return accessible.includes(driver.orgUnitId);
}

export class DriverWriteResolver {
  /**
   * Resolve the driver a record names.
   *
   * @throws AppError DRIVER_NOT_FOUND (400) when the id is malformed,
   *   matches no driver in this tenant, OR matches one the caller is not
   *   scoped to. As with vehicles, the three cases are deliberately
   *   indistinguishable to the caller: a distinguishable "exists but
   *   forbidden" response would let a scope-narrowed user enumerate
   *   another branch's roster one id at a time.
   */
  async resolveForWrite(
    driverId: string | null | undefined,
    scope: WriteScope
  ): Promise<Driver> {
    const raw = typeof driverId === 'string' ? driverId.trim() : '';
    const display = raw || String(driverId ?? '');

    // findById returns null for a malformed id (its own ObjectId.isValid
    // guard) as well as for a miss, so no separate validity branch is
    // needed here -- and adding one would reintroduce the distinguishable
    // error this method exists to avoid.
    const driver = raw ? await driverRepository.findById(raw, tenantIdOf(scope)) : null;

    if (!driver || !isWritable(driver, scope)) {
      throw new AppError(`Driver "${display}" not found`, 'DRIVER_NOT_FOUND', 400);
    }

    return driver;
  }
}

export const driverWriteResolver = new DriverWriteResolver();
