// modules/compliance/services/compliance.service.ts
import { complianceRuleRepository, ComplianceRuleRepository, complianceRecordRepository, ComplianceRecordRepository } from '../repositories/compliance.repository';
import {
  ComplianceRule,
  ComplianceRuleCreateDTO,
  ComplianceRecord,
  ComplianceRecordCreateDTO,
  ComplianceAppliesTo,
  ComplianceRecordStatus,
} from '../types/compliance.types';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import {
  ComplianceRuleCreatedEvent,
  ComplianceRecordCreatedEvent,
  ComplianceRecordDueSoonEvent,
  ComplianceRecordOverdueEvent,
  ComplianceRecordResolvedEvent,
} from '../events/compliance.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { monitoring } from '@/infrastructure/monitoring/logger';

function addRecurrence(date: Date, recurrence: ComplianceRule['recurrence']): Date {
  const next = new Date(date);
  if (recurrence === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (recurrence === 'quarterly') next.setMonth(next.getMonth() + 3);
  else if (recurrence === 'annual') next.setFullYear(next.getFullYear() + 1);
  return next;
}

export class ComplianceService {
  constructor(
    private readonly ruleRepo: ComplianceRuleRepository = complianceRuleRepository,
    private readonly recordRepo: ComplianceRecordRepository = complianceRecordRepository
  ) {}

  async createRule(data: ComplianceRuleCreateDTO, tenantId: string, userId: string): Promise<ComplianceRule> {
    if (!data.name?.trim()) throw new ValidationError('Rule name is required');

    const created = await this.ruleRepo.create(
      {
        tenantId,
        name: data.name,
        appliesTo: data.appliesTo,
        description: data.description,
        recurrence: data.recurrence || 'none',
        warningDays: data.warningDays ?? 30,
        status: 'active',
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new ComplianceRuleCreatedEvent(created, { tenantId, userId }));

    return created;
  }

  async listRules(appliesTo: ComplianceAppliesTo | undefined, tenantId: string): Promise<ComplianceRule[]> {
    return appliesTo ? this.ruleRepo.findActiveFor(appliesTo, tenantId) : this.ruleRepo.findMany({}, tenantId);
  }

  async createRecord(data: ComplianceRecordCreateDTO, tenantId: string, userId: string): Promise<ComplianceRecord> {
    const rule = await this.ruleRepo.findById(data.ruleId, tenantId);
    if (!rule) throw new NotFoundError('Compliance rule not found');

    const created = await this.recordRepo.create(
      {
        tenantId,
        ruleId: data.ruleId,
        entityType: data.entityType,
        entityId: data.entityId,
        dueDate: new Date(data.dueDate),
        status: 'pending',
        documentUrl: data.documentUrl,
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new ComplianceRecordCreatedEvent(created, { tenantId, userId }));
    await auditLog.logCreate(userId, tenantId, 'compliance_record', created._id!, { ruleId: data.ruleId, entityId: data.entityId });

    return created;
  }

  async resolveRecord(id: string, tenantId: string, userId: string, documentUrl?: string): Promise<ComplianceRecord> {
    const existing = await this.recordRepo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Compliance record not found');
    if (existing.status === 'resolved') throw new ConflictError('Record already resolved');

    const updated = await this.recordRepo.update(id, { status: 'resolved' as ComplianceRecordStatus, resolvedAt: new Date(), resolvedBy: userId, ...(documentUrl && { documentUrl }) }, tenantId, userId);
    if (!updated) throw new NotFoundError('Compliance record not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new ComplianceRecordResolvedEvent(updated, { tenantId, userId }));

    // Recurring rule → auto-schedule the next occurrence.
    const rule = await this.ruleRepo.findById(existing.ruleId, tenantId);
    if (rule && rule.recurrence !== 'none') {
      const nextDueDate = addRecurrence(existing.dueDate, rule.recurrence);
      await this.createRecord({ ruleId: rule._id!, entityType: existing.entityType, entityId: existing.entityId, dueDate: nextDueDate }, tenantId, userId);
    }

    return updated;
  }

  async waiveRecord(id: string, reason: string, tenantId: string, userId: string): Promise<ComplianceRecord> {
    const existing = await this.recordRepo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Compliance record not found');
    if (existing.status === 'resolved' || existing.status === 'waived') throw new ConflictError(`Cannot waive a record in status "${existing.status}"`);

    const updated = await this.recordRepo.update(id, { status: 'waived' as ComplianceRecordStatus, waiverReason: reason }, tenantId, userId);
    if (!updated) throw new NotFoundError('Compliance record not found');
    return updated;
  }

  async list(entityType: ComplianceAppliesTo | undefined, status: string | undefined, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<ComplianceRecord>> {
    return this.recordRepo.getFiltered(entityType, status, tenantId, pagination);
  }

  async get(id: string, tenantId: string): Promise<ComplianceRecord> {
    const record = await this.recordRepo.findById(id, tenantId);
    if (!record) throw new NotFoundError('Compliance record not found');
    return record;
  }

  /**
   * Recomputes status (pending → due_soon → overdue) for every open
   * record based on the current date and its rule's warningDays.
   * Intended for a scheduled job, mirroring MaintenanceRepository's
   * recalculateOverdueStatuses pattern.
   */
  async recalculateStatuses(tenantId: string): Promise<{ dueSoon: number; overdue: number }> {
    const open = await this.recordRepo.findAllOpen(tenantId);
    const now = new Date();
    let dueSoon = 0;
    let overdue = 0;
    const bus = EventBusFactory.getInstance();

    for (const record of open) {
      const rule = await this.ruleRepo.findById(record.ruleId, record.tenantId);
      const warningDays = rule?.warningDays ?? 30;
      const warningDate = new Date(record.dueDate);
      warningDate.setDate(warningDate.getDate() - warningDays);

      if (now >= record.dueDate && record.status !== 'overdue') {
        const updated = await this.recordRepo.update(record._id!, { status: 'overdue' as ComplianceRecordStatus }, record.tenantId, 'system');
        if (updated) {
          await bus.publish(new ComplianceRecordOverdueEvent(updated, { tenantId: record.tenantId, userId: 'system' }));
          overdue++;
        }
      } else if (now >= warningDate && now < record.dueDate && record.status === 'pending') {
        const updated = await this.recordRepo.update(record._id!, { status: 'due_soon' as ComplianceRecordStatus }, record.tenantId, 'system');
        if (updated) {
          await bus.publish(new ComplianceRecordDueSoonEvent(updated, { tenantId: record.tenantId, userId: 'system' }));
          dueSoon++;
        }
      }
    }

    monitoring.logInfo(`[ComplianceService] recalculateStatuses: ${dueSoon} due soon, ${overdue} overdue`, { tenantId });
    return { dueSoon, overdue };
  }
}

export const complianceService = new ComplianceService();