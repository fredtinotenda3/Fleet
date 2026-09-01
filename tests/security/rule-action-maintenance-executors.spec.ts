// tests/security/rule-action-maintenance-executors.spec.ts
//
// BACKLOG ITEM 6 -- the two executors that make dispatch do anything.
//
// `AttentionDispatchService` checks `ruleActionRegistry.isRegistered`
// before recording, so with these absent it refused every dispatch --
// correct, and the reason the whole feature was inert.
//
// The assertions worth having here are not "it calls the service". They
// are about the IDENTITY TRAP the audit named: an attention item's
// `entityId` is a vehicle `_id` for some sources and a reminder's or
// work order's `_id` for others, while both create DTOs are keyed on
// `license_plate`. An id passed where a plate belongs compiles,
// validates, and creates work against a vehicle that does not exist.

const mockWorkOrderService = { create: jest.fn(async () => ({ _id: 'wo-1' })) };
const mockWorkOrderRepo = { findById: jest.fn(async () => null) };
const mockMaintenanceService = { createReminder: jest.fn(async () => ({ _id: 'rem-1' })) };
const mockResolver = {
  resolveByPlate: jest.fn(),
  resolveById: jest.fn(),
};

jest.mock('@/modules/workorders/services/workorder.service', () => ({
  workOrderService: mockWorkOrderService,
}));
jest.mock('@/modules/workorders/repositories/workorder.repository', () => ({
  workOrderRepository: mockWorkOrderRepo,
}));
jest.mock('@/modules/maintenance/services/maintenance-command.service', () => ({
  maintenanceCommandService: mockMaintenanceService,
}));
jest.mock('@/modules/vehicles/services/vehicle-identity-resolver.service', () => ({
  vehicleIdentityResolver: mockResolver,
}));

import { registerMaintenanceRuleActions } from '@/modules/rules/actions/maintenance-actions';
import { ruleActionRegistry } from '@/modules/rules/registry/RuleActionRegistry';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE = 'unit-harare';

const VEHICLE = { _id: 'vehicle-1', license_plate: 'ADY2531', orgUnitId: HARARE };

function action(type: string, params: Record<string, unknown>) {
  return { type, params } as never;
}

const evaluationContext = { entityId: 'vehicle-1', entityType: 'predictive_maintenance' } as never;

beforeAll(() => {
  registerMaintenanceRuleActions();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockWorkOrderRepo.findById.mockResolvedValue(null);
  mockResolver.resolveByPlate.mockResolvedValue({ status: 'resolved', vehicle: VEHICLE });
  mockResolver.resolveById.mockResolvedValue({ status: 'resolved', vehicle: VEHICLE });
});

// ─────────────────────────────────────────────────────────────────────
describe('registration', () => {
  it('puts both action types on the registry', () => {
    // Without this, AttentionDispatchService refuses every dispatch with
    // "No executor registered" -- which is exactly what it did.
    expect(ruleActionRegistry.isRegistered('create_work_order')).toBe(true);
    expect(ruleActionRegistry.isRegistered('schedule_maintenance')).toBe(true);
  });

  it('is idempotent, so a second bootstrap pass is harmless', () => {
    registerMaintenanceRuleActions();
    registerMaintenanceRuleActions();
    expect(ruleActionRegistry.isRegistered('create_work_order')).toBe(true);
  });

  it('does not disturb the built-in actions', () => {
    // The registry is the ONE action seam; a new registration that
    // replaced start_workflow would break the compliance and
    // expense-anomaly dispatch paths silently.
    expect(ruleActionRegistry.registeredTypes()).toEqual(
      expect.arrayContaining(['create_work_order', 'schedule_maintenance'])
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('create_work_order', () => {
  it('creates against the RESOLVED license plate, never the raw identifier', async () => {
    await ruleActionRegistry.execute(
      action('create_work_order', {
        entityId: 'vehicle-1',
        title: 'Brake inspection',
        description: 'Predicted brake wear',
        severity: 'high',
        orgUnitId: HARARE,
      }),
      evaluationContext,
      TENANT,
      'user-1'
    );

    const [dto] = mockWorkOrderService.create.mock.calls[0] as [Record<string, unknown>];
    // The trap: passing 'vehicle-1' straight into license_plate
    // compiles, validates and creates work against nothing.
    expect(dto.license_plate).toBe('ADY2531');
    expect(dto.title).toBe('Brake inspection');
    expect(dto.priority).toBe('high');
    expect(dto.orgUnitId).toBe(HARARE);
  });

  it('prefers the plate hint when the item carries one', async () => {
    await ruleActionRegistry.execute(
      action('create_work_order', { entityLabel: 'ADY2531', title: 'Service' }),
      evaluationContext,
      TENANT
    );

    expect(mockResolver.resolveByPlate).toHaveBeenCalledWith('ADY2531', TENANT);
  });

  it('REFUSES when the plate matches two live vehicles', async () => {
    mockResolver.resolveByPlate.mockResolvedValue({ status: 'ambiguous', count: 2 });
    mockResolver.resolveById.mockResolvedValue({ status: 'not_found' });

    await expect(
      ruleActionRegistry.execute(
        action('create_work_order', { entityLabel: 'ADY2531', title: 'Service' }),
        evaluationContext,
        TENANT
      )
    ).rejects.toThrow(/matches 2 active vehicles/);

    // Picking one is a coin flip that creates work against the wrong
    // vehicle half the time.
    expect(mockWorkOrderService.create).not.toHaveBeenCalled();
  });

  it('REFUSES when no vehicle can be resolved at all', async () => {
    mockResolver.resolveByPlate.mockResolvedValue({ status: 'not_found' });
    mockResolver.resolveById.mockResolvedValue({ status: 'not_found' });

    await expect(
      ruleActionRegistry.execute(
        action('create_work_order', { entityId: 'ghost', title: 'Service' }),
        evaluationContext,
        TENANT
      )
    ).rejects.toThrow(/Refusing rather than creating work against an unidentified vehicle/);

    expect(mockWorkOrderService.create).not.toHaveBeenCalled();
  });

  it('REFUSES when the target is itself a work order', async () => {
    // The `maintenance` attention source includes OPEN WORK ORDERS, and
    // actionForSource maps that source to create_work_order. Without
    // this guard the platform creates a work order for a work order,
    // every refresh cycle.
    mockWorkOrderRepo.findById.mockResolvedValue({ _id: 'wo-9', title: 'Existing brake job' } as never);

    await expect(
      ruleActionRegistry.execute(
        action('create_work_order', { entityId: 'wo-9', entityLabel: 'ADY2531', title: 'Brake job' }),
        evaluationContext,
        TENANT
      )
    ).rejects.toThrow(/already work order/);

    expect(mockWorkOrderService.create).not.toHaveBeenCalled();
  });

  it('requires a title rather than inventing one', async () => {
    await expect(
      ruleActionRegistry.execute(
        action('create_work_order', { entityId: 'vehicle-1' }),
        evaluationContext,
        TENANT
      )
    ).rejects.toThrow(/requires params.title/);
  });

  it('maps severity to priority explicitly, defaulting unknown values to medium', async () => {
    for (const [severity, priority] of [
      ['critical', 'critical'],
      ['high', 'high'],
      ['medium', 'medium'],
      ['low', 'low'],
      [undefined, 'medium'],
      ['bogus', 'medium'],
    ] as const) {
      mockWorkOrderService.create.mockClear();
      await ruleActionRegistry.execute(
        action('create_work_order', { entityId: 'vehicle-1', title: 'T', severity }),
        evaluationContext,
        TENANT
      );
      const [dto] = mockWorkOrderService.create.mock.calls[0] as [Record<string, unknown>];
      expect(dto.priority).toBe(priority);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('schedule_maintenance', () => {
  it('schedules against the resolved plate with the supplied due date', async () => {
    const due = new Date('2026-10-01T00:00:00Z');

    await ruleActionRegistry.execute(
      action('schedule_maintenance', {
        entityId: 'vehicle-1',
        title: 'Brake pad replacement',
        dueDate: due,
        cost: 400,
        severity: 'high',
      }),
      evaluationContext,
      TENANT,
      'user-1'
    );

    const [dto] = mockMaintenanceService.createReminder.mock.calls[0] as [Record<string, unknown>];
    expect(dto.license_plate).toBe('ADY2531');
    expect(dto.due_date).toEqual(due);
    expect(dto.estimated_cost).toBe(400);
    expect(dto.priority).toBe('high');
  });

  it('never schedules for today -- that reopens as overdue on the next refresh', async () => {
    const before = Date.now();

    await ruleActionRegistry.execute(
      action('schedule_maintenance', { entityId: 'vehicle-1', title: 'Service' }),
      evaluationContext,
      TENANT
    );

    const [dto] = mockMaintenanceService.createReminder.mock.calls[0] as [{ due_date: Date }];
    // A reminder due immediately is overdue on the next feed refresh,
    // which puts it straight back into the attention feed at critical
    // severity: the platform escalating its own output.
    expect(dto.due_date.getTime()).toBeGreaterThan(before + 24 * 60 * 60 * 1000);
  });

  it('omits estimated_cost when the source had none, rather than writing 0', async () => {
    await ruleActionRegistry.execute(
      action('schedule_maintenance', { entityId: 'vehicle-1', title: 'Service' }),
      evaluationContext,
      TENANT
    );

    const [dto] = mockMaintenanceService.createReminder.mock.calls[0] as [Record<string, unknown>];
    // A 0 reads as "free" and feeds the maintenance cost forecast.
    expect('estimated_cost' in dto).toBe(false);
  });

  it('accepts an ISO date string, and ignores an unparsable one', async () => {
    await ruleActionRegistry.execute(
      action('schedule_maintenance', {
        entityId: 'vehicle-1',
        title: 'Service',
        dueDate: '2026-11-15T00:00:00.000Z',
      }),
      evaluationContext,
      TENANT
    );
    let [dto] = mockMaintenanceService.createReminder.mock.calls[0] as [{ due_date: Date }];
    expect(dto.due_date.toISOString()).toBe('2026-11-15T00:00:00.000Z');

    mockMaintenanceService.createReminder.mockClear();
    await ruleActionRegistry.execute(
      action('schedule_maintenance', { entityId: 'vehicle-1', title: 'Service', dueDate: 'soon-ish' }),
      evaluationContext,
      TENANT
    );
    [dto] = mockMaintenanceService.createReminder.mock.calls[0] as [{ due_date: Date }];
    // Falls back to the lead time rather than producing an Invalid Date,
    // which Mongo would store as null and every date filter would miss.
    expect(Number.isNaN(dto.due_date.getTime())).toBe(false);
  });

  it('REFUSES an unresolvable vehicle', async () => {
    mockResolver.resolveByPlate.mockResolvedValue({ status: 'not_found' });
    mockResolver.resolveById.mockResolvedValue({ status: 'not_found' });

    await expect(
      ruleActionRegistry.execute(
        action('schedule_maintenance', { entityId: 'ghost', title: 'Service' }),
        evaluationContext,
        TENANT
      )
    ).rejects.toThrow(/unidentified vehicle/);

    expect(mockMaintenanceService.createReminder).not.toHaveBeenCalled();
  });

  it('does NOT apply the work-order guard -- scheduling from a reminder is legitimate', async () => {
    // The guard exists because the maintenance source includes work
    // orders and create_work_order would duplicate one. Scheduling
    // maintenance from a predictive item whose entityId happens to be
    // known elsewhere is not that case.
    mockWorkOrderRepo.findById.mockResolvedValue({ _id: 'wo-9', title: 'x' } as never);

    await ruleActionRegistry.execute(
      action('schedule_maintenance', { entityId: 'vehicle-1', title: 'Service' }),
      evaluationContext,
      TENANT
    );

    expect(mockMaintenanceService.createReminder).toHaveBeenCalled();
  });
});
