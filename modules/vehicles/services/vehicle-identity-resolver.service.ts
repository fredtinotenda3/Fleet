// modules/vehicles/services/vehicle-identity-resolver.service.ts
//
// PHASE 0, ITEM 3: canonical, reusable translation between the two
// vehicle identifiers used across this codebase.
//
//   - CANONICAL persisted identity: the vehicle's Mongo `_id`. This is
//     what finance's AllocationPosting.vehicleId, the AI services'
//     `entityId`/`vehicleId` fields, and (after the Phase 0 ownership
//     fix) AttentionOwnershipResolver all key off.
//   - EXTERNAL/BUSINESS identifier: `license_plate`. Human-facing,
//     mutable (a vehicle can be re-plated), and -- confirmed against
//     this repository's own `findByLicensePlate`/`findByLicensePlates`
//     queries -- NOT guaranteed unique at the database level. Nothing
//     enforces a unique index on `license_plate` today.
//
// Every place that used to resolve one from the other rolled its own
// (intelligence's vehicleId-only reads, operations' license_plate-only
// reads, finance's `_id`-only reads). None of them handled the
// ambiguous-plate or missing-vehicle cases consistently, and several
// silently trusted a caller-supplied identifier without checking it
// belonged to the right tenant/org unit. This resolver is the ONE
// controlled place that translation happens from here on: it does not
// replace any of those call sites in this pass (see the Phase 0
// completion report for why), it just gives a safe, tested,
// single-purpose seam for anything that connects intelligence to
// actions/finance later to call instead of re-deriving its own
// lookup.
//
// FAIL-CLOSED CONTRACT
// ---------------------
// Every method here returns a discriminated `VehicleIdentityResult`
// rather than throwing or returning a bare `Vehicle | null`. The
// specific reason a lookup did not resolve (not found vs. ambiguous
// vs. out of scope) matters to a caller like AttentionOwnershipResolver,
// which must decide "leave orgUnitId unset" for all three, but a
// caller doing something more sensitive (e.g. a future write path)
// may want to log an 'ambiguous' distinctly from a plain 'not_found'.
// No method here ever guesses -- an ambiguous plate never returns "the
// first match", a vehicle outside the caller's org-unit scope is
// reported exactly as "not_found" (never as a distinguishable
// forbidden/exists-but-hidden result, which would leak existence to a
// scope-narrowed caller -- the same principle vehicle.repository.ts's
// search-scoping fix documents).
//
// SCOPING
// -------
// `resolveById` / `resolveByPlate` are TENANT-scoped only -- they
// deliberately do NOT filter by org unit, because their purpose is to
// discover a vehicle's TRUE own org unit (e.g. for
// AttentionOwnershipResolver), which by definition may differ from
// whatever org unit the current caller has active. They never cross a
// TENANT boundary (delegated entirely to BaseRepository's
// tenantId-scoped `findById`/`findMany`, which return nothing for a
// vehicle in another tenant).
//
// `resolveByIdInScope` / `resolveByPlateInScope` layer an ADDITIONAL
// org-unit check on top, for callers acting on behalf of a specific
// user (e.g. a future lookup endpoint): a vehicle that resolves at the
// tenant level but sits outside `context.accessibleOrgUnitIds` is
// reported as not_found, matching this codebase's established
// fail-closed convention for org-unit-scoped reads.

import { vehicleRepository } from '../repositories/vehicle.repository';
import { Vehicle } from '@/shared/types/vehicle.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

export type VehicleIdentityResult =
  | { status: 'resolved'; vehicle: Vehicle }
  | { status: 'not_found' }
  /**
   * More than one active (non-deleted) vehicle in this tenant currently
   * carries this plate. `count` is included for logging/monitoring
   * only -- callers must not use it to decide "pick the first one".
   */
  | { status: 'ambiguous'; count: number };

function normalizePlate(licensePlate: string | null | undefined): string | null {
  const trimmed = licensePlate?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

/** True when `vehicle` is visible under `context`'s org-unit scope. Mirrors tenantScopeService's fail-closed rule: an org-wide role (accessibleOrgUnitIds === null) sees everything in-tenant; a scope-narrowed role never sees a vehicle with no orgUnitId of its own. */
function inOrgUnitScope(vehicle: Vehicle, context: TenantContext): boolean {
  if (context.accessibleOrgUnitIds === null) return true;
  if (!vehicle.orgUnitId) return false;
  return context.accessibleOrgUnitIds.includes(vehicle.orgUnitId);
}

export class VehicleIdentityResolver {
  /**
   * Canonical identity -> vehicle. Tenant-scoped only (see class doc).
   * Cross-tenant ids -- including a syntactically valid ObjectId that
   * belongs to a different tenant's vehicle -- resolve to `not_found`;
   * BaseRepository.findById's tenantId filter guarantees this, it is
   * not re-checked here.
   */
  async resolveById(vehicleId: string | null | undefined, tenantId: string): Promise<VehicleIdentityResult> {
    if (!vehicleId) return { status: 'not_found' };
    const vehicle = await vehicleRepository.findById(vehicleId, tenantId);
    return vehicle ? { status: 'resolved', vehicle } : { status: 'not_found' };
  }

  /**
   * External identifier -> vehicle. Tenant-scoped only (see class doc).
   * Queries ALL active vehicles carrying this plate (not just the
   * first) specifically so an ambiguous plate can be detected and
   * failed closed rather than silently resolved to whichever document
   * a `findOne` happened to return first.
   */
  async resolveByPlate(licensePlate: string | null | undefined, tenantId: string): Promise<VehicleIdentityResult> {
    const plate = normalizePlate(licensePlate);
    if (!plate) return { status: 'not_found' };

    const matches = await vehicleRepository.findByLicensePlates([plate], tenantId);
    if (matches.length === 0) return { status: 'not_found' };
    if (matches.length > 1) return { status: 'ambiguous', count: matches.length };
    return { status: 'resolved', vehicle: matches[0] };
  }

  /** `resolveById`, additionally requiring the vehicle be within `context`'s accessible org units. */
  async resolveByIdInScope(vehicleId: string | null | undefined, context: TenantContext): Promise<VehicleIdentityResult> {
    const result = await this.resolveById(vehicleId, context.organizationId);
    if (result.status !== 'resolved') return result;
    return inOrgUnitScope(result.vehicle, context) ? result : { status: 'not_found' };
  }

  /** `resolveByPlate`, additionally requiring the vehicle be within `context`'s accessible org units. */
  async resolveByPlateInScope(licensePlate: string | null | undefined, context: TenantContext): Promise<VehicleIdentityResult> {
    const result = await this.resolveByPlate(licensePlate, context.organizationId);
    if (result.status !== 'resolved') return result;
    return inOrgUnitScope(result.vehicle, context) ? result : { status: 'not_found' };
  }
}

export const vehicleIdentityResolver = new VehicleIdentityResolver();
