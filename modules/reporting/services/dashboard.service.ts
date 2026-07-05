// modules/reporting/services/dashboard.service.ts

import { dashboardRepository, DashboardRepository } from '../repositories/dashboard.repository';
import { kpiDefinitionRepository } from '../repositories/kpi-definition.repository';
import { reportDefinitionRepository } from '../repositories/report-definition.repository';
import { reportQueryEngine } from './report-query.engine';
import { pivotEngine } from './pivot.engine';
import { kpiEngine } from './kpi.engine';
import {
  Dashboard,
  DashboardCreateDTO,
  DashboardUpdateDTO,
  DashboardData,
  DashboardWidgetResult,
} from '../types/dashboard.types';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DashboardCreatedEvent, DashboardUpdatedEvent, DashboardDeletedEvent } from '../events/dashboard.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export class DashboardService {
  constructor(private readonly repo: DashboardRepository = dashboardRepository) {}

  async create(data: DashboardCreateDTO, tenantId: string, userId: string): Promise<Dashboard> {
    if (!data.name?.trim()) throw new ValidationError('Dashboard name is required');

    const created = await this.repo.create(
      {
        tenantId,
        name: data.name,
        description: data.description,
        isExecutive: data.isExecutive ?? false,
        widgets: data.widgets ?? [],
      },
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DashboardCreatedEvent(created, { tenantId, userId }));
    await auditLog.logCreate(userId, tenantId, 'dashboard', created._id!, { name: created.name });

    return created;
  }

  async update(id: string, data: DashboardUpdateDTO, tenantId: string, userId: string): Promise<Dashboard> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Dashboard not found');

    const { _id, ...updates } = data;
    const updated = await this.repo.update(id, updates, tenantId, userId);
    if (!updated) throw new NotFoundError('Dashboard not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DashboardUpdatedEvent(updated, updates, { tenantId, userId }));
    await auditLog.logUpdate(userId, tenantId, 'dashboard', id, existing, updated);

    return updated;
  }

  async delete(id: string, tenantId: string, userId: string): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Dashboard not found');

    await this.repo.softDelete(id, tenantId, userId);

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DashboardDeletedEvent(id, existing.name, tenantId, { userId }));
    await auditLog.logDelete(userId, tenantId, 'dashboard', id, { name: existing.name });
  }

  async get(id: string, tenantId: string): Promise<Dashboard> {
    const dashboard = await this.repo.findById(id, tenantId);
    if (!dashboard) throw new NotFoundError('Dashboard not found');
    return dashboard;
  }

  async list(tenantId: string): Promise<Dashboard[]> {
    return this.repo.findByOrganization(tenantId);
  }

  async listExecutive(tenantId: string): Promise<Dashboard[]> {
    return this.repo.findExecutive(tenantId);
  }

  /**
   * Executes every widget on a dashboard in parallel and returns rendered
   * data. Each widget fails independently (captured in `error`) so one
   * broken widget (e.g. a deleted underlying report/KPI) never blanks
   * the whole dashboard.
   */
  async render(id: string, tenantId: string): Promise<DashboardData> {
    const dashboard = await this.get(id, tenantId);

    const widgets: DashboardWidgetResult[] = await Promise.all(
      dashboard.widgets.map(async (widget): Promise<DashboardWidgetResult> => {
        try {
          if (widget.type === 'kpi') {
            if (!widget.kpiDefinitionId) throw new ValidationError('KPI widget missing kpiDefinitionId');
            const kpi = await kpiDefinitionRepository.findById(widget.kpiDefinitionId, tenantId);
            if (!kpi) throw new NotFoundError('KPI definition not found');
            const data = await kpiEngine.evaluate(kpi, tenantId);
            return { widgetId: widget.id, type: widget.type, title: widget.title, data };
          }

          if (!widget.reportDefinitionId) {
            throw new ValidationError(`${widget.type} widget missing reportDefinitionId`);
          }
          const definition = await reportDefinitionRepository.findById(widget.reportDefinitionId, tenantId);
          if (!definition) throw new NotFoundError('Report definition not found');

          if (widget.type === 'pivot') {
            if (!definition.pivot) throw new ValidationError('Report has no pivot configuration');
            const rawDefinition = { ...definition, groupBy: [], aggregations: [] };
            const flat = await reportQueryEngine.run(rawDefinition, tenantId);
            const data = pivotEngine.pivot(flat, definition.pivot);
            return { widgetId: widget.id, type: widget.type, title: widget.title, data };
          }

          const data = await reportQueryEngine.run(definition, tenantId);
          return { widgetId: widget.id, type: widget.type, title: widget.title, data };
        } catch (error) {
          return {
            widgetId: widget.id,
            type: widget.type,
            title: widget.title,
            data: null,
            error: error instanceof Error ? error.message : 'Failed to render widget',
          };
        }
      })
    );

    return {
      dashboardId: dashboard._id!,
      name: dashboard.name,
      isExecutive: dashboard.isExecutive,
      widgets,
      generatedAt: new Date(),
    };
  }
}

export const dashboardService = new DashboardService();