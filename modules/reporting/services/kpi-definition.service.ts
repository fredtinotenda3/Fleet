// modules/reporting/services/kpi-definition.service.ts

import { kpiDefinitionRepository, KpiDefinitionRepository } from '../repositories/kpi-definition.repository';
import { dataSourceRegistry } from '../registry/DataSourceRegistry';
import { bootstrapDataSources } from '../registry/bootstrap-data-sources';
import { kpiEngine } from './kpi.engine';
import {
  KPIDefinition,
  KPIDefinitionCreateDTO,
  KPIDefinitionUpdateDTO,
  KPIEvaluationResult,
} from '../types/kpi.types';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import {
  KpiDefinitionCreatedEvent,
  KpiDefinitionUpdatedEvent,
  KpiDefinitionDeletedEvent,
} from '../events/kpi-definition.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

bootstrapDataSources();

export class KpiDefinitionService {
  constructor(private readonly repo: KpiDefinitionRepository = kpiDefinitionRepository) {}

  async create(data: KPIDefinitionCreateDTO, tenantId: string, userId: string): Promise<KPIDefinition> {
    if (!dataSourceRegistry.get(data.dataSource)) {
      throw new ValidationError(`Unknown data source "${data.dataSource}"`);
    }

    const created = await this.repo.create(
      {
        tenantId,
        name: data.name,
        description: data.description,
        dataSource: data.dataSource,
        numerator: data.numerator,
        denominator: data.denominator,
        filters: data.filters ?? [],
        unit: data.unit,
        threshold: data.threshold,
        targetValue: data.targetValue,
      },
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new KpiDefinitionCreatedEvent(created, { tenantId, userId }));
    await auditLog.logCreate(userId, tenantId, 'kpi_definition', created._id!, { name: created.name });

    return created;
  }

  async update(id: string, data: Partial<KPIDefinitionUpdateDTO>, tenantId: string, userId: string): Promise<KPIDefinition> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('KPI definition not found');

    const { _id, ...updates } = data as KPIDefinitionUpdateDTO;
    const updated = await this.repo.update(id, updates, tenantId, userId);
    if (!updated) throw new NotFoundError('KPI definition not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new KpiDefinitionUpdatedEvent(updated, updates, { tenantId, userId }));
    await auditLog.logUpdate(userId, tenantId, 'kpi_definition', id, existing, updated);

    return updated;
  }

  async delete(id: string, tenantId: string, userId: string): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('KPI definition not found');

    await this.repo.softDelete(id, tenantId, userId);

    const bus = EventBusFactory.getInstance();
    await bus.publish(new KpiDefinitionDeletedEvent(id, existing.name, tenantId, { userId }));
    await auditLog.logDelete(userId, tenantId, 'kpi_definition', id, { name: existing.name });
  }

  async get(id: string, tenantId: string): Promise<KPIDefinition> {
    const kpi = await this.repo.findById(id, tenantId);
    if (!kpi) throw new NotFoundError('KPI definition not found');
    return kpi;
  }

  async list(tenantId: string): Promise<KPIDefinition[]> {
    return this.repo.findByOrganization(tenantId);
  }

  async evaluate(id: string, tenantId: string): Promise<KPIEvaluationResult> {
    const kpi = await this.get(id, tenantId);
    return kpiEngine.evaluate(kpi, tenantId);
  }

  async evaluateAll(tenantId: string): Promise<KPIEvaluationResult[]> {
    const kpis = await this.list(tenantId);
    return kpiEngine.evaluateMany(kpis, tenantId);
  }
}

export const kpiDefinitionService = new KpiDefinitionService();