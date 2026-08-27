// modules/workflows/services/workflow-ownership.resolver.ts
//
// PHASE 5, F-14 -- which org unit does a workflow INSTANCE belong to?
//
// ---------------------------------------------------------------------
// WHY THIS EXISTS
// ---------------------------------------------------------------------
// A workflow DEFINITION is organization-wide policy. An INSTANCE is one
// branch's actual request, and it must be scoped like every other
// operational record in this platform.
//
// The question "whose is this?" cannot be answered by the request
// context. Phase 0 established that rule for AttentionItem and the same
// logic applies here, more sharply: a workflow instance is frequently
// started by a BACKGROUND HANDLER (an outbox event, a rule action) that
// has no acting user and no active org unit at all. Stamping such an
// instance with the caller's context would either fail (there is no
// context) or attribute a Bulawayo expense's approval to whichever
// process happened to handle the event.
//
// So ownership is DERIVED FROM THE TARGET ENTITY -- the expense, the
// work order, the vehicle the workflow is about. That entity already
// carries the correct orgUnitId, inherited from its own vehicle or
// driver at write time.
//
// ---------------------------------------------------------------------
// FAIL-CLOSED CONTRACT
// ---------------------------------------------------------------------
// `resolveInstanceOrgUnit()` NEVER throws and NEVER guesses. Every one
// of the following returns `null`, meaning the instance is written with
// no orgUnitId and is therefore visible only to organization-wide
// callers -- never broadcast to every unit:
//
//   * an entityType this resolver does not know how to locate;
//   * an entity that does not exist in THIS tenant (a cross-tenant id
//     simply does not match, because every lookup below is routed
//     through a tenant-scoped repository method);
//   * an entity that exists but carries no orgUnitId of its own;
//   * a lookup that throws.
//
// The direction matters. An unresolvable owner producing `null` makes
// the instance HARDER to see, not easier. The opposite default -- guess
// a unit, or fall back to the caller's -- would put another branch's
// approval into somebody's queue.
//
// ---------------------------------------------------------------------
// WHY NOT A GENERIC LOOKUP
// ---------------------------------------------------------------------
// `entityType` is free text on WorkflowInstance and can be anything a
// rule author writes. A generic "find a document with this _id in any
// collection" would be both a cross-collection scan and a way to make
// the resolver read a collection nobody intended. The explicit switch
// below is the point: an unknown type is unresolvable, and unresolvable
// is safe.

import { monitoring } from '@/infrastructure/monitoring/logger';

/** Entity types whose org unit this resolver knows how to find. */
export type WorkflowOwnerEntityType =
  | 'expense'
  | 'fuel_log'
  | 'maintenance'
  | 'work_order'
  | 'vehicle'
  | 'purchase_request';

/**
 * Resolves the owning org unit for a workflow instance.
 *
 * @param entityType what the workflow is about, as recorded on the instance
 * @param entityId   that entity's id, in this tenant
 * @param tenantId   threaded from the caller; NEVER read from the entity,
 *                   so a cross-tenant target is structurally impossible
 */
export async function resolveInstanceOrgUnit(
  entityType: string,
  entityId: string,
  tenantId: string
): Promise<string | null> {
  if (!entityType || !entityId || !tenantId) return null;

  try {
    switch (entityType) {
      case 'expense': {
        const { expenseRepository } = await import(
          '@/modules/expenses/repositories/expense.repository'
        );
        const expense = await expenseRepository.findById(entityId, tenantId);
        return orgUnitOf(expense);
      }

      case 'fuel_log': {
        const { fuelRepository } = await import('@/modules/fuel/repositories/fuel.repository');
        const log = await fuelRepository.findById(entityId, tenantId);
        return orgUnitOf(log);
      }

      case 'maintenance': {
        const { maintenanceRepository } = await import(
          '@/modules/maintenance/repositories/maintenance.repository'
        );
        const reminder = await maintenanceRepository.findById(entityId, tenantId);
        return orgUnitOf(reminder);
      }

      case 'work_order': {
        const { workOrderRepository } = await import(
          '@/modules/workorders/repositories/workorder.repository'
        );
        const order = await workOrderRepository.findById(entityId, tenantId);
        return orgUnitOf(order);
      }

      case 'vehicle': {
        const { vehicleRepository } = await import(
          '@/modules/vehicles/repositories/vehicle.repository'
        );
        const vehicle = await vehicleRepository.findById(entityId, tenantId);
        return orgUnitOf(vehicle);
      }

      case 'purchase_request': {
        const { purchaseRequestRepository } = await import(
          '@/modules/procurement/repositories/purchase-request.repository'
        );
        const request = await purchaseRequestRepository.findById(entityId, tenantId);
        return orgUnitOf(request);
      }

      default:
        // Unknown entityType. Unresolvable is SAFE: the instance is
        // written without an org unit and is visible only to
        // organization-wide callers.
        return null;
    }
  } catch (error) {
    // A lookup failure must not prevent the workflow starting -- an
    // approval that never begins is worse than one an extra person can
    // see. It is logged, and the instance falls back to unresolved
    // (org-wide visibility only), never to the caller's context.
    monitoring.logWarn('[workflow-ownership] Could not resolve owning org unit', {
      entityType,
      entityId,
      error: (error as Error).message,
    });
    return null;
  }
}

/** Reads an entity's own orgUnitId, treating blank as absent. */
function orgUnitOf(entity: unknown): string | null {
  const value = (entity as { orgUnitId?: unknown } | null)?.orgUnitId;
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Whether a caller may act on an instance owned by `orgUnitId`.
 *
 * `accessibleOrgUnitIds === null` means organization-wide visibility --
 * the convention TenantContext already uses everywhere else.
 *
 * AN INSTANCE WITH NO ORG UNIT IS VISIBLE ONLY TO ORGANIZATION-WIDE
 * CALLERS. That is the deliberate fail-closed reading and it matches
 * assertVehicleInScope (Phase 0) rather than the geofence convention:
 * an unassigned instance is MISSING INFORMATION, not shared reference
 * data, and showing it to every unit would leak one branch's approval
 * into another's queue on the strength of an absent field.
 */
export function isInstanceInScope(
  instanceOrgUnitId: string | undefined | null,
  accessibleOrgUnitIds: string[] | null
): boolean {
  if (accessibleOrgUnitIds === null) return true;
  if (!instanceOrgUnitId) return false;
  return accessibleOrgUnitIds.includes(instanceOrgUnitId);
}
