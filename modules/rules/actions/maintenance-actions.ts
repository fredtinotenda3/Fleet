// modules/rules/actions/maintenance-actions.ts
//
// BACKLOG ITEM 6 -- the two executors attention dispatch needs.
//
// ---------------------------------------------------------------------
// WHY HERE
// ---------------------------------------------------------------------
// `RuleActionRegistry`'s own doc comment anticipated these by name
// ("lets Phase 5 grow new action types later, e.g. create_work_order").
// They live beside `default-actions.ts` for the same reason that file
// does: the registry is the ONE action seam, and an executor registered
// somewhere else is an action type whose implementation a reviewer
// cannot find from the registry.
//
// They are not attention-specific. A business rule can fire
// `create_work_order` just as legitimately as a dispatched attention
// item, which is precisely the argument for putting them on the shared
// registry rather than inside the attention module.
//
// ---------------------------------------------------------------------
// THE IDENTITY PROBLEM, AND WHY THESE RESOLVE RATHER THAN TRUST
// ---------------------------------------------------------------------
// This is the trap the audit flagged as "entity identity splits exactly
// where the closed loop must join", and it is live here:
//
//   * `WorkOrderCreateDTO` and `ReminderCreateDTO` are both keyed on
//     `license_plate`;
//   * `NeedsAttentionItem.entityId` is a vehicle Mongo `_id` for
//     predictive_maintenance and fuel_fraud, but the REMINDER's or WORK
//     ORDER's own `_id` for maintenance-sourced items, whose plate sits
//     in `entityLabel`;
//   * an id passed where a plate is expected compiles, validates, and
//     creates a work order against a vehicle that does not exist -- or,
//     worse, against a different one.
//
// So neither executor accepts an identifier on trust. Both resolve
// through `vehicleIdentityResolver`, which is tenant-scoped and fails
// closed on an ambiguous plate, and both REFUSE when the vehicle cannot
// be resolved. Refusing is safe: the dispatch record is already written
// (the service records before executing, deliberately), so a refusal
// leaves a visible, repairable trace rather than silent work against
// the wrong vehicle.
//
// ---------------------------------------------------------------------
// A DISPATCH MUST NOT CREATE A COPY OF ITS OWN SOURCE
// ---------------------------------------------------------------------
// `actionForSource` maps the `maintenance` source to
// `create_work_order`, and one of the things that source reads is OPEN
// WORK ORDERS (see `readOpenWorkOrders`). Dispatching such an item
// would create a second work order for a work order. The executor
// checks whether the target id is itself a work order in this tenant
// and refuses if so. One `findById`, and it closes a loop that would
// otherwise be discovered as a duplicated workshop queue.

import { ruleActionRegistry, IRuleActionExecutor } from '../registry/RuleActionRegistry';
import { RuleAction, RuleEvaluationContext } from '../types/rule.types';
import { vehicleIdentityResolver } from '@/modules/vehicles/services/vehicle-identity-resolver.service';
import { workOrderService } from '@/modules/workorders/services/workorder.service';
import { workOrderRepository } from '@/modules/workorders/repositories/workorder.repository';
import { maintenanceCommandService } from '@/modules/maintenance/services/maintenance-command.service';
import type { Priority } from '@/shared/types/common.types';

/** How long after dispatch an auto-scheduled maintenance reminder falls due. */
const SCHEDULED_MAINTENANCE_LEAD_DAYS = 7;

export class RuleActionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleActionInputError';
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Maps an attention item's severity to a work-order priority.
 *
 * Explicit rather than a cast: the two vocabularies happen to share
 * three of four members today, and a cast would silently produce an
 * invalid priority the first time either list changed.
 */
function priorityFromSeverity(severity: unknown): Priority {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'low':
      return 'low';
    default:
      return 'medium';
  }
}

/**
 * Resolves the vehicle an action targets, from whichever identifier the
 * caller has.
 *
 * Tries the plate first when one is supplied (`entityLabel` on
 * maintenance-sourced items IS the plate) and falls back to treating
 * `entityId` as a vehicle `_id`. Returns the canonical plate, because
 * that is what both create DTOs are keyed on.
 */
async function resolveTargetPlate(
  params: Record<string, unknown>,
  context: RuleEvaluationContext,
  tenantId: string
): Promise<{ licensePlate: string; vehicleId: string }> {
  const plateHint = str(params.licensePlate) ?? str(params.entityLabel);
  const idHint = str(params.entityId) ?? str(context.entityId as unknown);

  if (plateHint) {
    const byPlate = await vehicleIdentityResolver.resolveByPlate(plateHint, tenantId);
    if (byPlate.status === 'resolved') {
      return { licensePlate: byPlate.vehicle.license_plate, vehicleId: String(byPlate.vehicle._id) };
    }
    if (byPlate.status === 'ambiguous') {
      // Two live vehicles share this plate. Picking one is a coin flip
      // that creates work against the wrong vehicle half the time.
      throw new RuleActionInputError(
        `License plate "${plateHint}" matches ${byPlate.count} active vehicles; refusing to guess.`
      );
    }
  }

  if (idHint) {
    const byId = await vehicleIdentityResolver.resolveById(idHint, tenantId);
    if (byId.status === 'resolved') {
      return { licensePlate: byId.vehicle.license_plate, vehicleId: String(byId.vehicle._id) };
    }
  }

  throw new RuleActionInputError(
    'Could not resolve a vehicle for this action from ' +
      `${JSON.stringify({ plate: plateHint ?? null, id: idHint ?? null })}. ` +
      'Refusing rather than creating work against an unidentified vehicle.'
  );
}

/**
 * Refuses when the target id is itself a work order.
 *
 * See the header: the `maintenance` attention source includes open work
 * orders, so without this a dispatch would create a work order for a
 * work order, every refresh cycle, forever.
 */
async function assertTargetIsNotAWorkOrder(
  params: Record<string, unknown>,
  tenantId: string
): Promise<void> {
  const id = str(params.entityId);
  if (!id) return;

  const existing = await workOrderRepository.findById(id, tenantId);
  if (existing) {
    throw new RuleActionInputError(
      `Target ${id} is already work order "${existing.title}". ` +
        'Dispatching would duplicate it, so this is refused.'
    );
  }
}

class CreateWorkOrderAction implements IRuleActionExecutor {
  async execute(
    action: RuleAction,
    context: RuleEvaluationContext,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    const params = (action.params ?? {}) as Record<string, unknown>;

    await assertTargetIsNotAWorkOrder(params, tenantId);
    const { licensePlate } = await resolveTargetPlate(params, context, tenantId);

    const title = str(params.title);
    if (!title) {
      throw new RuleActionInputError('create_work_order requires params.title');
    }

    await workOrderService.create(
      {
        license_plate: licensePlate,
        title,
        description: str(params.description),
        priority: priorityFromSeverity(params.severity),
        // Carried so the created work inherits the ITEM's own unit
        // rather than the executing process's context. WorkOrderService
        // falls back to the vehicle's own when this is absent.
        ...(str(params.orgUnitId) ? { orgUnitId: str(params.orgUnitId) } : {}),
      } as never,
      tenantId,
      userId || 'system'
    );
  }
}

class ScheduleMaintenanceAction implements IRuleActionExecutor {
  async execute(
    action: RuleAction,
    context: RuleEvaluationContext,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    const params = (action.params ?? {}) as Record<string, unknown>;

    const { licensePlate } = await resolveTargetPlate(params, context, tenantId);

    const title = str(params.title);
    if (!title) {
      throw new RuleActionInputError('schedule_maintenance requires params.title');
    }

    /**
     * The due date is taken from the prediction when it supplies one
     * and otherwise falls a fixed lead time out.
     *
     * NOT "today": a reminder due the moment it is created is overdue
     * on the next refresh, which puts it straight back into the
     * attention feed at critical severity -- a loop where the platform
     * escalates its own output.
     */
    const suppliedDue = params.dueDate;
    const dueDate =
      suppliedDue instanceof Date
        ? suppliedDue
        : typeof suppliedDue === 'string' && !Number.isNaN(Date.parse(suppliedDue))
          ? new Date(suppliedDue)
          : new Date(Date.now() + SCHEDULED_MAINTENANCE_LEAD_DAYS * 24 * 60 * 60 * 1000);

    const estimatedCost = typeof params.cost === 'number' && Number.isFinite(params.cost)
      ? params.cost
      : undefined;

    await maintenanceCommandService.createReminder(
      {
        license_plate: licensePlate,
        title,
        due_date: dueDate,
        notes: str(params.description),
        priority: priorityFromSeverity(params.severity),
        // Omitted rather than zero-filled when the source had no cost
        // estimate: a 0 here reads as "free", and it is an input to the
        // maintenance forecast.
        ...(estimatedCost !== undefined ? { estimated_cost: estimatedCost } : {}),
      },
      tenantId,
      userId || 'system'
    );
  }
}

let registered = false;

/**
 * Registers `create_work_order` and `schedule_maintenance`.
 *
 * Idempotent, and called from the same place `registerDefaultRuleActions`
 * is, so the registry is complete the moment the rule engine module
 * loads. Without this, `AttentionDispatchService` refuses every
 * dispatch with "No executor registered" -- correct behaviour, and the
 * reason dispatch has been inert.
 */
export function registerMaintenanceRuleActions(): void {
  if (registered) return;
  registered = true;

  ruleActionRegistry.register('create_work_order', new CreateWorkOrderAction());
  ruleActionRegistry.register('schedule_maintenance', new ScheduleMaintenanceAction());
}
