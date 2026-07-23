// modules/reporting/services/report-execution.service.ts

import { reportExecutionRepository, ReportExecutionRepository } from '../repositories/report-execution.repository';
import { reportDefinitionRepository } from '../repositories/report-definition.repository';
import { dashboardRepository } from '../repositories/dashboard.repository';
import { reportQueryEngine } from './report-query.engine';
import { pivotEngine } from './pivot.engine';
import { dashboardService } from './dashboard.service';
import { reportDeliveryService } from './report-delivery.service';
import {
  ReportExecution,
  GenerateExecutionInput,
  ExecutionFormat,
} from '../types/report-execution.types';
import { ReportResult } from '../types/report-definition.types';
import { PivotResult } from '../types/pivot.types';
import { buildCsvBuffer } from '../generators/csv-report.generator';
import { buildExcelBuffer } from '../generators/excel-report.generator';
import { buildPdfBuffer } from '../generators/pdf-report.generator';
import { buildWordBuffer } from '../generators/word-report.generator';
import { storageService } from '@/infrastructure/storage/storage.service';
import { queueService, JobType } from '@/infrastructure/queue/queue.service';
import { JobPriority } from '@/infrastructure/queue/queue-definitions';
import { NotFoundError, ValidationError, AppError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import {
  ReportExecutionRequestedEvent,
  ReportExecutionCompletedEvent,
  ReportExecutionFailedEvent,
} from '../events/report-execution.events';
import { PaginationParams } from '@/shared/types/common.types';

const EXTENSION_MAP: Record<ExecutionFormat, string> = {
  pdf: 'pdf',
  excel: 'xlsx',
  csv: 'csv',
  word: 'doc',
  json: 'json',
};

const MIME_MAP: Record<ExecutionFormat, string> = {
  pdf: 'application/pdf',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  word: 'application/msword',
  json: 'application/json',
};

export class ReportExecutionService {
  constructor(private readonly repo: ReportExecutionRepository = reportExecutionRepository) {}

  /** Ad-hoc, user-initiated export/download. Creates a pending record then hands off to the worker. */
  async generate(input: GenerateExecutionInput, tenantId: string, userId: string): Promise<ReportExecution> {
    if (!input.reportDefinitionId && !input.dashboardId) {
      throw new ValidationError('Either reportDefinitionId or dashboardId is required');
    }

    let name = 'Report';
    if (input.reportDefinitionId) {
      const def = await reportDefinitionRepository.findById(input.reportDefinitionId, tenantId);
      if (!def) throw new NotFoundError('Report definition not found');
      name = def.name;
    } else if (input.dashboardId) {
      const dash = await dashboardRepository.findById(input.dashboardId, tenantId);
      if (!dash) throw new NotFoundError('Dashboard not found');
      name = dash.name;
    }

    const created = await this.repo.create(
      {
        name,
        sourceType: input.reportDefinitionId ? 'report_definition' : 'dashboard',
        reportDefinitionId: input.reportDefinitionId,
        dashboardId: input.dashboardId,
        format: input.format,
        status: 'pending',
        generatedBy: userId,
        generatedAt: new Date(),
        drilldownFilters: input.drilldownFilters,
        emailedTo: input.emailTo,
        downloadCount: 0,
      },
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new ReportExecutionRequestedEvent(created, { tenantId, userId }));

    await queueService.addJob(
      JobType.EXPORT_DATA,
      {
        type: JobType.EXPORT_DATA,
        payload: { kind: 'execution', executionId: created._id },
        tenantId,
        userId,
        priority: JobPriority.NORMAL,
      },
      { jobId: `report-execution:${created._id}` }
    );

    return created;
  }

  /** Called by the worker for ad-hoc executions (kind: 'execution'). */
  async executeGeneration(executionId: string, tenantId: string, userId: string): Promise<ReportExecution> {
    const execution = await this.repo.findById(executionId, tenantId, false, true);
    if (!execution) throw new NotFoundError('Report execution not found');

    await this.repo.updateStatus(executionId, tenantId, 'processing');

    try {
      const buffer = await this.buildBuffer(execution, tenantId);

      const stored = await storageService.uploadFile({
        tenantId,
        entityType: 'report_execution',
        entityId: executionId,
        file: buffer,
        filename: `${this.sanitizeFilename(execution.name)}.${EXTENSION_MAP[execution.format]}`,
        mimeType: MIME_MAP[execution.format],
      });

      const updated = await this.repo.updateStatus(executionId, tenantId, 'completed', {
        fileUrl: stored.url,
        fileKey: stored.key,
        fileSize: stored.size,
      });
      if (!updated) throw new NotFoundError('Report execution not found after generation');

      if (execution.emailedTo?.length) {
        await reportDeliveryService.deliver(updated, tenantId);
      }

      const bus = EventBusFactory.getInstance();
      await bus.publish(new ReportExecutionCompletedEvent(updated, { tenantId, userId }));
      await auditLog.log({
        action: 'REPORT_EXECUTION_COMPLETED',
        userId,
        tenantId,
        entityType: 'report_execution',
        entityId: executionId,
      });

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repo.updateStatus(executionId, tenantId, 'failed', { errorMessage: message });

      const bus = EventBusFactory.getInstance();
      await bus.publish(new ReportExecutionFailedEvent(executionId, message, tenantId, { userId }));
      await auditLog.log({
        action: 'REPORT_EXECUTION_FAILED',
        userId,
        tenantId,
        entityType: 'report_execution',
        entityId: executionId,
        metadata: { error: message },
      });

      throw error;
    }
  }

  /**
   * Entry point for the recurring scheduler path (kind: 'scheduled'),
   * which has no pre-created ReportExecution row -- one is created
   * fresh on every scheduled run.
   */
  async generateScheduled(
    reportDefinitionId: string,
    format: ExecutionFormat,
    recipients: string[],
    tenantId: string
  ): Promise<ReportExecution> {
    const def = await reportDefinitionRepository.findById(reportDefinitionId, tenantId);
    if (!def) throw new NotFoundError('Report definition not found');

    const created = await this.repo.create(
      {
        name: def.name,
        sourceType: 'report_definition',
        reportDefinitionId,
        format,
        status: 'pending',
        generatedBy: 'system',
        generatedAt: new Date(),
        emailedTo: recipients,
        downloadCount: 0,
        isScheduledRun: true,
      },
      tenantId,
      'system'
    );

    return this.executeGeneration(created._id!, tenantId, 'system');
  }

  private async buildBuffer(execution: ReportExecution, tenantId: string): Promise<Buffer> {
    let result: ReportResult;
    let pivotResult: PivotResult | undefined;

    if (execution.sourceType === 'report_definition') {
      const def = await reportDefinitionRepository.findById(execution.reportDefinitionId!, tenantId);
      if (!def) throw new NotFoundError('Report definition not found');

      // FIX: an export must contain the FULL matching result set (up to
      // the shared FULL_RESULT_CAP), not a 100-row preview page --
      // runFull() pushes the drilldown filters + definition filters
      // into Mongo and returns everything that matches, flagged
      // `truncated` if the match count exceeds the cap.
      result = await reportQueryEngine.runFull(def, tenantId, execution.drilldownFilters ?? []);

      if (def.pivot) {
        const rawDefinition = { ...def, groupBy: [], aggregations: [] };
        const flat = await reportQueryEngine.runFull(rawDefinition, tenantId);
        pivotResult = pivotEngine.pivot(flat, def.pivot);
      }
    } else {
      const data = await dashboardService.render(execution.dashboardId!, tenantId);
      result = {
        columns: [
          { key: 'widget', label: 'Widget', type: 'string' },
          { key: 'value', label: 'Value', type: 'string' },
        ],
        rows: data.widgets.map((w) => ({
          widget: w.title,
          value: w.error ? `Error: ${w.error}` : JSON.stringify(w.data),
        })),
      };
    }

    switch (execution.format) {
      case 'csv':
        return buildCsvBuffer(result);
      case 'excel':
        return buildExcelBuffer(result, pivotResult);
      case 'pdf':
        return buildPdfBuffer(execution.name, result);
      case 'word':
        return buildWordBuffer(execution.name, result);
      case 'json':
        return Buffer.from(JSON.stringify(result, null, 2), 'utf-8');
      default:
        throw new AppError(`Unsupported export format: ${execution.format}`, 'UNSUPPORTED_FORMAT', 400);
    }
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9_\-]+/gi, '_').slice(0, 80) || 'report';
  }

  async get(id: string, tenantId: string): Promise<ReportExecution> {
    const execution = await this.repo.findById(id, tenantId);
    if (!execution) throw new NotFoundError('Report execution not found');
    return execution;
  }

  async list(tenantId: string, pagination: PaginationParams) {
    return this.repo.findByOrganization(tenantId, pagination);
  }

  async download(id: string, tenantId: string, userId: string): Promise<{ buffer: Buffer; execution: ReportExecution }> {
    const execution = await this.get(id, tenantId);
    if (execution.status !== 'completed' || !execution.fileKey) {
      throw new AppError(`Execution is not ready for download (status: ${execution.status})`, 'EXECUTION_NOT_READY', 409);
    }

    const buffer = await storageService.getFile(execution.fileKey);
    if (!buffer) throw new NotFoundError('File could not be retrieved from storage');

    await this.repo.incrementDownloadCount(id, tenantId);
    await auditLog.log({
      action: 'REPORT_EXECUTION_DOWNLOADED',
      userId,
      tenantId,
      entityType: 'report_execution',
      entityId: id,
    });

    return { buffer, execution };
  }
}

export const reportExecutionService = new ReportExecutionService();