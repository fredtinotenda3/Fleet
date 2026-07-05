// modules/reporting/services/report-template.service.ts

import { reportTemplateRepository, ReportTemplateRepository } from '../repositories/report-template.repository';
import { reportBuilderService } from './report-builder.service';
import { ReportTemplate, ReportTemplateCreateDTO } from '../types/report-template.types';
import { ReportDefinition } from '../types/report-definition.types';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ReportTemplateCreatedEvent, ReportTemplateDeletedEvent } from '../events/report-template.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

const SYSTEM_TEMPLATE_SEEDS: ReportTemplateCreateDTO[] = [
  {
    name: 'Fleet Overview',
    description: 'High-level snapshot of the vehicle fleet',
    category: 'fleet_overview',
    definition: {
      name: 'Fleet Overview',
      dataSource: 'vehicles',
      fields: ['license_plate', 'make', 'model', 'status', 'odometer'],
      groupBy: [{ field: 'status' }],
      aggregations: [{ field: 'odometer', fn: 'avg', alias: 'avg_odometer' }],
    },
  },
  {
    name: 'Cost Analysis by Category',
    description: 'Total expenses grouped by category',
    category: 'cost_analysis',
    definition: {
      name: 'Cost Analysis by Category',
      dataSource: 'expenses',
      fields: ['expense_type_id', 'amount'],
      groupBy: [{ field: 'expense_type_id' }],
      aggregations: [{ field: 'amount', fn: 'sum', alias: 'total_amount' }],
    },
  },
  {
    name: 'Fuel Efficiency Summary',
    description: 'Fuel volume and cost by vehicle',
    category: 'fuel_efficiency',
    definition: {
      name: 'Fuel Efficiency Summary',
      dataSource: 'fuel',
      fields: ['license_plate', 'fuel_volume', 'cost'],
      groupBy: [{ field: 'license_plate' }],
      aggregations: [
        { field: 'fuel_volume', fn: 'sum', alias: 'total_volume' },
        { field: 'cost', fn: 'sum', alias: 'total_cost' },
      ],
    },
  },
  {
    name: 'Maintenance Backlog',
    description: 'Open maintenance reminders by priority',
    category: 'maintenance',
    definition: {
      name: 'Maintenance Backlog',
      dataSource: 'maintenance',
      fields: ['license_plate', 'title', 'due_date', 'status', 'priority'],
      filters: [{ field: 'status', operator: 'neq', value: 'completed' }],
      groupBy: [{ field: 'priority' }],
      aggregations: [{ field: 'estimated_cost', fn: 'sum', alias: 'total_estimated_cost' }],
    },
  },
];

export class ReportTemplateService {
  constructor(private readonly repo: ReportTemplateRepository = reportTemplateRepository) {}

  async create(data: ReportTemplateCreateDTO, tenantId: string, userId: string): Promise<ReportTemplate> {
    if (!data.definition?.fields?.length) {
      throw new ValidationError('Template definition must include at least one field');
    }

    const created = await this.repo.create(
      {
        tenantId,
        name: data.name,
        description: data.description,
        category: data.category,
        definition: data.definition,
        isSystemTemplate: false,
      },
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new ReportTemplateCreatedEvent(created, { tenantId, userId }));
    await auditLog.logCreate(userId, tenantId, 'report_template', created._id!, { name: created.name });

    return created;
  }

  /** Saves an existing live report definition as a reusable template. */
  async createFromDefinition(
    definition: ReportDefinition,
    category: ReportTemplate['category'],
    tenantId: string,
    userId: string
  ): Promise<ReportTemplate> {
    return this.create(
      {
        name: `${definition.name} Template`,
        description: definition.description,
        category,
        definition: {
          name: definition.name,
          description: definition.description,
          dataSource: definition.dataSource,
          fields: definition.fields,
          filters: definition.filters,
          groupBy: definition.groupBy,
          aggregations: definition.aggregations,
          sort: definition.sort,
          pivot: definition.pivot,
          chart: definition.chart,
        },
      },
      tenantId,
      userId
    );
  }

  async delete(id: string, tenantId: string, userId: string): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Report template not found');
    if (existing.isSystemTemplate) throw new ValidationError('System templates cannot be deleted');

    await this.repo.softDelete(id, tenantId, userId);

    const bus = EventBusFactory.getInstance();
    await bus.publish(new ReportTemplateDeletedEvent(id, existing.name, tenantId, { userId }));
    await auditLog.logDelete(userId, tenantId, 'report_template', id, { name: existing.name });
  }

  async listVisible(tenantId: string): Promise<ReportTemplate[]> {
    return this.repo.findVisibleTo(tenantId);
  }

  async get(id: string, tenantId: string): Promise<ReportTemplate> {
    const templates = await this.repo.findVisibleTo(tenantId);
    const found = templates.find((t) => t._id === id);
    if (!found) throw new NotFoundError('Report template not found');
    return found;
  }

  /** Clones a template's saved definition into a live, tenant-owned ReportDefinition. */
  async instantiate(templateId: string, tenantId: string, userId: string, nameOverride?: string): Promise<ReportDefinition> {
    const template = await this.get(templateId, tenantId);

    return reportBuilderService.create(
      { ...template.definition, name: nameOverride || template.definition.name },
      tenantId,
      userId
    );
  }

  /** Idempotently seeds the built-in system template catalogue. Safe to call on every boot. */
  async seedSystemTemplates(): Promise<void> {
    const existing = await this.repo.findVisibleTo('system');
    const existingNames = new Set(existing.map((t) => t.name));

    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      if (existingNames.has(seed.name)) continue;
      // FIX: Remove tenantId from the object since createSystemTemplate adds it internally
      await this.repo.createSystemTemplate({
        name: seed.name,
        description: seed.description,
        category: seed.category,
        definition: seed.definition,
        isSystemTemplate: true,
      });
    }
  }
}

export const reportTemplateService = new ReportTemplateService();