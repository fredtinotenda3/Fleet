// modules/reporting/services/report-builder.service.ts

import { reportDefinitionRepository, ReportDefinitionRepository } from '../repositories/report-definition.repository';
import {
  ReportDefinition,
  ReportDefinitionCreateDTO,
  ReportDefinitionUpdateDTO,
  ReportResult,
} from '../types/report-definition.types';
import { reportQueryEngine } from './report-query.engine';
import { pivotEngine } from './pivot.engine';
import { PivotResult } from '../types/pivot.types';
import { dataSourceRegistry } from '../registry/DataSourceRegistry';
import { bootstrapDataSources } from '../registry/bootstrap-data-sources';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import {
  ReportDefinitionCreatedEvent,
  ReportDefinitionUpdatedEvent,
  ReportDefinitionDeletedEvent,
} from '../events/report-definition.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { PaginationParams } from '@/shared/types/common.types';

bootstrapDataSources();

export class ReportBuilderService {
  constructor(private readonly repo: ReportDefinitionRepository = reportDefinitionRepository) {}

  async create(data: ReportDefinitionCreateDTO, tenantId: string, userId: string): Promise<ReportDefinition> {
    if (!dataSourceRegistry.get(data.dataSource)) {
      throw new ValidationError(`Unknown data source "${data.dataSource}"`);
    }
    if (!data.fields || data.fields.length === 0) {
      throw new ValidationError('At least one field must be selected');
    }

    const created = await this.repo.create(
      {
        name: data.name,
        description: data.description,
        dataSource: data.dataSource,
        fields: data.fields,
        filters: data.filters ?? [],
        groupBy: data.groupBy ?? [],
        aggregations: data.aggregations ?? [],
        sort: data.sort,
        pivot: data.pivot,
        chart: data.chart,
        schedule: data.schedule,
      },
      tenantId,
      userId
    );

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ReportDefinitionCreatedEvent(created, { tenantId, userId }));
    await auditLog.logCreate(userId, tenantId, 'report_definition', created._id!, { name: created.name });

    return created;
  }

  async update(id: string, data: Partial<ReportDefinitionUpdateDTO>, tenantId: string, userId: string): Promise<ReportDefinition> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Report definition not found');

    const { _id, ...updates } = data as ReportDefinitionUpdateDTO;
    const updated = await this.repo.update(id, updates, tenantId, userId);
    if (!updated) throw new NotFoundError('Report definition not found');

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ReportDefinitionUpdatedEvent(updated, updates, { tenantId, userId }));
    await auditLog.logUpdate(userId, tenantId, 'report_definition', id, existing, updated);

    return updated;
  }

  async delete(id: string, tenantId: string, userId: string): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Report definition not found');

    await this.repo.softDelete(id, tenantId, userId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ReportDefinitionDeletedEvent(id, existing.name, tenantId, { userId }));
    await auditLog.logDelete(userId, tenantId, 'report_definition', id, { name: existing.name });
  }

  async duplicate(id: string, tenantId: string, userId: string): Promise<ReportDefinition> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Report definition not found');

    return this.create(
      {
        name: `${existing.name} (Copy)`,
        description: existing.description,
        dataSource: existing.dataSource,
        fields: existing.fields,
        filters: existing.filters,
        groupBy: existing.groupBy,
        aggregations: existing.aggregations,
        sort: existing.sort,
        pivot: existing.pivot,
        chart: existing.chart,
      },
      tenantId,
      userId
    );
  }

  async get(id: string, tenantId: string): Promise<ReportDefinition> {
    const definition = await this.repo.findById(id, tenantId);
    if (!definition) throw new NotFoundError('Report definition not found');
    return definition;
  }

  async list(tenantId: string): Promise<ReportDefinition[]> {
    return this.repo.findByOrganization(tenantId);
  }

  /**
   * Runs the definition and returns ONE PAGE of the flat/grouped
   * tabular preview (used by the builder UI, which paginates rather
   * than rendering every matching row at once). `pagination` defaults
   * to the engine's own preview page size when omitted.
   */
  async preview(id: string, tenantId: string, pagination?: PaginationParams): Promise<ReportResult> {
    const definition = await this.get(id, tenantId);
    return reportQueryEngine.run(definition, tenantId, { pagination });
  }

  /**
   * Runs the definition's raw rows through the pivot engine, if a
   * pivot config is saved on it. Uses runFull() (not preview's
   * paginated run()) because a pivot table needs every matching row to
   * bucket correctly -- pivoting only the first page would silently
   * under-count every cell.
   */
  async previewPivot(id: string, tenantId: string): Promise<PivotResult> {
    const definition = await this.get(id, tenantId);
    if (!definition.pivot) {
      throw new ValidationError('This report has no pivot configuration');
    }
    const rawDefinition: ReportDefinition = { ...definition, groupBy: [], aggregations: [] };
    const flat = await reportQueryEngine.runFull(rawDefinition, tenantId);
    return pivotEngine.pivot(flat, definition.pivot);
  }
}

export const reportBuilderService = new ReportBuilderService();