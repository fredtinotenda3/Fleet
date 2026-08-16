// modules/attention/services/attention-ownership.resolver.ts
//
// PHASE 0, ITEM 1: resolves the TRUE owning org unit for a persisted
// AttentionItem, replacing the previous behaviour (see
// needs-attention.service.ts's old persistFeed) of stamping every row
// in a refresh with the caller's *active* org unit.
//
// WHY A SEPARATE, CENTRAL RESOLVER (not one fix per AI service)
// ----------------------------------------------------------------
// needsAttentionService.getFeed() combines seven sources, each with a
// different notion of "the entity this item is about":
//
//   predictive_maintenance, fuel_fraud  -> a vehicle, by Mongo _id
//   driver_risk                        -> an organization MEMBER, by
//                                          userId (organization.members
//                                          -- NOT the standalone
//                                          tbldrivers table; see the
//                                          'organization-member' target
//                                          kind below for why these are
//                                          not the same thing)
//   expense_anomaly                    -> an expense record, whose
//                                          OWN orgUnitId is already
//                                          inherited from its vehicle
//                                          at write time
//   compliance, maintenance            -> the source document (a
//                                          ComplianceRecord, Reminder,
//                                          or WorkOrder) already
//                                          carries its own correct
//                                          orgUnitId, inherited from
//                                          its vehicle/driver at write
//                                          time -- nothing to resolve,
//                                          just don't discard it
//   fleet_health                       -> a RECOMMENDATION spanning
//                                          zero or more vehicles, with
//                                          no single owning entity
//
// Duplicating "go fetch the vehicle/driver/expense and read its
// orgUnitId" inside five different AI services (per the audit's
// explicit instruction NOT to do that) would mean five more places to
// keep the fail-closed/tenant-isolation rules consistent. Instead,
// each per-source reader in needs-attention.service.ts builds one
// small, explicit `AttentionOwnerTarget` describing what kind of
// entity (if any) the item is about and how to find it -- data every
// reader already has in hand -- and this resolver is the ONE place
// that turns a target into an orgUnitId.
//
// FAIL-CLOSED CONTRACT
// ---------------------
// resolveOrgUnitId() NEVER throws and NEVER guesses. Any of the
// following returns `null` (meaning: leave the persisted row's
// orgUnitId unset, which is invisible to every org-unit-scoped read --
// the existing, already-shipped fail-closed behaviour for an
// unresolvable owner):
//   - no target (source doesn't identify a single owning entity, e.g.
//     a multi-vehicle fleet-health recommendation)
//   - target id is missing/empty
//   - target entity does not exist in THIS tenant (including a
//     same-shaped id that belongs to a different tenant -- every
//     lookup here is routed through a tenant-scoped repository method,
//     so a cross-tenant id simply does not match)
//   - target entity exists but has no orgUnitId of its own yet
//     (unbackfilled row -- same convention as every other org-unit-
//     scoped module in this codebase)
//   - the underlying lookup throws (logged, not propagated -- a
//     resolution failure must never take down the whole feed
//     refresh, matching needsAttentionService's own per-source
//     failure-isolation stance)
//
// It is intentionally impossible to construct a target that reaches
// across tenants: every branch below passes `tenantId` (the CALLER's
// tenant, threaded from needsAttentionService, never taken from the
// target) into a tenant-scoped repository method, and org-unit-
// scoping is deliberately NOT applied here -- the whole point of this
// resolver is to discover an item's TRUE own org unit, which may
// legitimately differ from the org unit the requester currently has
// active (see the Harare-user / Bulawayo-vehicle example in the Phase
// 0 report).

import { vehicleIdentityResolver } from '@/modules/vehicles/services/vehicle-identity-resolver.service';
import { driverRepository } from '@/modules/drivers/repositories/driver.repository';
import { resolveOrganization } from '@/server/tenancy/organization-resolver';
import { expenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { monitoring } from '@/infrastructure/monitoring/logger';
import '@/shared/types/driver.tenancy-addendum';

/**
 * Describes, for one NeedsAttentionItem, what kind of entity (if any)
 * it is about and the identifier needed to look it up. Built by each
 * per-source reader in needs-attention.service.ts, which already has
 * the source record in hand.
 */
export type AttentionOwnerTarget =
  /** Resolve via the vehicle's own Mongo _id (predictive_maintenance, fuel_fraud). */
  | { kind: 'vehicle'; vehicleId: string | null | undefined }
  /** Resolve via the `tbldrivers` document's own Mongo _id, for sources whose entity truly is a `Driver` row. NOT used by driver_risk -- see 'organization-member' below. */
  | { kind: 'driver'; driverId: string | null | undefined }
  /**
   * Resolve via `organization.members[].userId` (NOT `tbldrivers`).
   * driver_risk's `DriverRiskScore.driverId` is confirmed (from
   * driver-risk.service.ts's own reads) to be
   * `OrganizationMember.userId` sourced from `organization.members` --
   * a different collection/shape than the standalone `tbldrivers`
   * table `driverRepository` reads. A member's org-unit scope lives on
   * that embedded member record's own `orgUnitId` field (see
   * OrganizationMember in organization.types.ts), not on a `tbldrivers`
   * row, so this is its own target kind rather than being folded into
   * 'driver'. A member with no `orgUnitId` set (org-wide access, not
   * scoped to one branch) has no single owning org unit and resolves
   * to null -- fail-closed, not "the organization's own top-level org
   * unit", which would be a guess.
   */
  | { kind: 'organization-member'; userId: string | null | undefined }
  /** Resolve via the expense's own Mongo _id; its orgUnitId is already inherited from its vehicle at write time (expense_anomaly). */
  | { kind: 'expense'; expenseId: string | null | undefined }
  /**
   * The caller already has the true orgUnitId in hand, read directly
   * off the source document under this tenant's scope (a
   * ComplianceRecord or maintenance Reminder/WorkOrder, both of which
   * carry their own orgUnitId inherited from their vehicle/driver at
   * write time). No further lookup is performed -- this variant exists
   * so those two sources don't pay for a second round-trip to re-
   * derive a value they already have, while still going through this
   * resolver's single choke point rather than writing to
   * attention_items directly.
   */
  | { kind: 'org-unit-direct'; orgUnitId: string | null | undefined }
  /**
   * Resolve via VehicleIdentityResolver's plate lookup rather than a
   * Mongo _id. Not used by the LIVE per-source readers (maintenance's
   * Reminder/WorkOrder already have their own orgUnitId in hand --
   * see 'org-unit-direct' above) -- this exists for
   * scripts/backfill-attention-item-ownership.ts, which must
   * reconstruct a target from a PERSISTED AttentionItem row that only
   * stored `entityLabel` (a license plate) for maintenance-sourced
   * items, never a vehicle _id.
   */
  | { kind: 'vehicle-by-plate'; licensePlate: string | null | undefined }
  /**
   * A persisted id that is a vehicle OR a driver, but which one is not
   * recorded (a historical AttentionItem row from a 'compliance'
   * source stores only `entityId`, not `entityType` -- see
   * attention-item.types.ts). Tries the vehicle collection first, then
   * `tbldrivers`; a hit on either is authoritative (Mongo ObjectIds
   * are not shared across collections in this codebase's data model,
   * so a match on one is never ambiguous with a match on the other).
   * Resolves to null, never a guess, if neither collection has this
   * id in this tenant. Same "reconstruction only" scope as
   * 'vehicle-by-plate' above -- not used by the live per-source
   * readers, which have `entityType` available and use
   * 'org-unit-direct' instead.
   */
  | { kind: 'vehicle-or-driver'; id: string | null | undefined }
  /** The source has no single owning entity (e.g. a fleet-health recommendation spanning several vehicles). Always resolves to null. */
  | { kind: 'none' };

export class AttentionOwnershipResolver {
  /**
   * Resolves one item's target to its true owning orgUnitId, or `null`
   * if it cannot be safely determined (see the fail-closed contract
   * above). `tenantId` is always the CALLER's tenant -- every lookup
   * is scoped to it, so a target cannot resolve to a row belonging to
   * a different tenant.
   */
  async resolveOrgUnitId(tenantId: string, target: AttentionOwnerTarget | undefined): Promise<string | null> {
    if (!target) return null;

    try {
      switch (target.kind) {
        case 'vehicle': {
          if (!target.vehicleId) return null;
          const result = await vehicleIdentityResolver.resolveById(target.vehicleId, tenantId);
          return result.status === 'resolved' ? result.vehicle.orgUnitId ?? null : null;
        }
        case 'driver': {
          if (!target.driverId) return null;
          const driver = await driverRepository.findById(target.driverId, tenantId);
          return driver?.orgUnitId ?? null;
        }
        case 'organization-member': {
          if (!target.userId) return null;
          const organization = await resolveOrganization(tenantId);
          if (!organization) return null;
          const member = (organization.members || []).find((m) => m.userId === target.userId);
          return member?.orgUnitId ?? null;
        }
        case 'expense': {
          if (!target.expenseId) return null;
          const expense = await expenseRepository.findById(target.expenseId, tenantId);
          return expense?.orgUnitId ?? null;
        }
        case 'org-unit-direct':
          return target.orgUnitId ?? null;
        case 'vehicle-by-plate': {
          if (!target.licensePlate) return null;
          const result = await vehicleIdentityResolver.resolveByPlate(target.licensePlate, tenantId);
          return result.status === 'resolved' ? result.vehicle.orgUnitId ?? null : null;
        }
        case 'vehicle-or-driver': {
          if (!target.id) return null;
          const vehicleResult = await vehicleIdentityResolver.resolveById(target.id, tenantId);
          if (vehicleResult.status === 'resolved') return vehicleResult.vehicle.orgUnitId ?? null;
          const driver = await driverRepository.findById(target.id, tenantId);
          return driver?.orgUnitId ?? null;
        }
        case 'none':
        default:
          return null;
      }
    } catch (error) {
      monitoring.logError('[attentionOwnershipResolver] resolveOrgUnitId failed', error as Error);
      return null;
    }
  }
}

export const attentionOwnershipResolver = new AttentionOwnershipResolver();
