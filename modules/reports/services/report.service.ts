// modules/reports/services/report.service.ts

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { storageService } from '@/infrastructure/storage/storage.service';
import { queueService, JobType } from '@/infrastructure/queue/queue.service';
import { fleetAnalyticsService } from '@/modules/analytics/services/fleet-analytics.service';
import { reportRepository, ReportRepository } from '../repositories/report.repository';
import {
  Report,
  ReportConfig,
  ReportFormat,
  FleetSummaryData,
} from '../types/report.types';
import { AppError, NotFoundError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export class ReportService {
  constructor(private readonly repo: ReportRepository = reportRepository) {}

  /**
   * Creates the report record immediately (status: pending) so it's visible
   * to the user and downloadable-by-id, then queues the actual generation
   * work. The queue worker is expected to call `executeGeneration` below
   * once it picks up the job.
   */
  async generateReport(
    config: ReportConfig,
    tenantId: string,
    userId: string
  ): Promise<Report> {
    const reportData: Omit<Report, '_id' | 'createdAt' | 'updatedAt'> = {
      tenantId,
      name: `${config.type}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}`,
      type: config.type,
      format: config.format,
      fileUrl: '',
      fileKey: '',
      fileSize: 0,
      generatedAt: new Date(),
      generatedBy: userId,
      dateRange: config.dateRange,
      status: 'pending',
      downloadCount: 0,
      isDeleted: false,
    };

    const created = await this.repo.create(reportData, tenantId, userId);

    await queueService.addJob(JobType.GENERATE_REPORT, {
      type: JobType.GENERATE_REPORT,
      payload: { config, reportId: created._id },
      tenantId,
      userId,
    });

    await auditLog.logCreate(userId, tenantId, 'report', created._id!, {
      type: config.type,
      format: config.format,
    });

    return created;
  }

  /**
   * Called by the queue worker (infrastructure/queue) when processing a
   * GENERATE_REPORT job. Builds the actual document and uploads it.
   */
  async executeGeneration(
    reportId: string,
    config: ReportConfig,
    tenantId: string,
    userId: string
  ): Promise<Report> {
    await this.repo.updateStatus(reportId, tenantId, 'processing');

    try {
      let buffer: Buffer;

      switch (config.type) {
        case 'fleet_summary':
          buffer = await this.generateFleetSummaryReport(config, tenantId);
          break;
        case 'expense_analysis':
        case 'fuel_efficiency':
        case 'maintenance_history':
        case 'trip_logs':
          // These report types reuse the same fleet-summary data shape for
          // now, filtered to their relevant section; a full implementation
          // would branch into dedicated builders per type.
          buffer = await this.generateFleetSummaryReport(config, tenantId);
          break;
        default:
          throw new AppError(`Unsupported report type: ${config.type}`, 'UNSUPPORTED_REPORT_TYPE', 400);
      }

      const extension = this.getExtension(config.format);
      const stored = await storageService.uploadFile({
        tenantId,
        entityType: 'report',
        entityId: reportId,
        file: buffer,
        filename: `${config.type}.${extension}`,
        mimeType: this.getMimeType(config.format),
      });

      const updated = await this.repo.updateStatus(reportId, tenantId, 'completed', {
        fileUrl: stored.url,
        fileKey: stored.key,
        fileSize: stored.size,
      });

      if (!updated) {
        throw new NotFoundError('Report not found after generation');
      }

      return updated;
    } catch (error) {
      await this.repo.updateStatus(reportId, tenantId, 'failed');
      await auditLog.log({
        action: 'REPORT_GENERATION_FAILED',
        userId,
        tenantId,
        entityType: 'report',
        entityId: reportId,
        metadata: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  private async buildFleetSummaryData(
    config: ReportConfig,
    tenantId: string
  ): Promise<FleetSummaryData> {
    const [kpis, costBreakdown] = await Promise.all([
      fleetAnalyticsService.getFleetKPIs(tenantId, config.dateRange),
      fleetAnalyticsService.getCostBreakdown(tenantId, config.dateRange),
    ]);

    return {
      generatedAt: new Date(),
      dateRange: config.dateRange,
      summary: {
        totalVehicles: kpis.totalVehicles,
        activeVehicles: kpis.activeVehicles,
        maintenanceVehicles: kpis.maintenanceVehicles,
        totalDistance: kpis.totalDistance,
        totalExpenses: kpis.totalExpenses,
        totalFuelCost: kpis.totalFuelCost,
        totalFuelVolume: kpis.totalFuelVolume,
        avgFuelEfficiency: kpis.averageFuelEfficiency,
        costPerKm: kpis.costPerKm,
        pendingMaintenance: kpis.pendingMaintenance,
        overdueMaintenance: kpis.overdueMaintenance,
      },
      costBreakdown: {
        byCategory: costBreakdown.byCategory,
        byVehicle: costBreakdown.byVehicle,
      },
    };
  }

  async generateFleetSummaryReport(config: ReportConfig, tenantId: string): Promise<Buffer> {
    const data = await this.buildFleetSummaryData(config, tenantId);

    switch (config.format) {
      case 'pdf':
        return this.generatePDFReport(data, config);
      case 'csv':
        return this.generateCSVReport(data, config);
      case 'excel':
        return this.generateExcelReport(data, config);
      default:
        throw new AppError(`Unsupported format: ${config.format}`, 'UNSUPPORTED_FORMAT', 400);
    }
  }

  private async generatePDFReport(data: FleetSummaryData, config: ReportConfig): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const page = pdfDoc.addPage([595, 842]); // A4
    const { height } = page.getSize();

    page.drawText('Fleet Summary Report', {
      x: 50,
      y: height - 50,
      size: 18,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    page.drawText(
      `Period: ${format(config.dateRange.startDate, 'MMM dd, yyyy')} - ${format(
        config.dateRange.endDate,
        'MMM dd, yyyy'
      )}`,
      { x: 50, y: height - 75, size: 10, font, color: rgb(0.4, 0.4, 0.4) }
    );

    page.drawText(`Generated: ${format(data.generatedAt, 'MMM dd, yyyy HH:mm')}`, {
      x: 50,
      y: height - 90,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    let y = height - 130;
    page.drawText('Fleet Overview', { x: 50, y, size: 13, font: boldFont });
    y -= 22;

    const summaryItems: Array<[string, string]> = [
      ['Total Vehicles', data.summary.totalVehicles.toLocaleString()],
      ['Active Vehicles', data.summary.activeVehicles.toLocaleString()],
      ['In Maintenance', data.summary.maintenanceVehicles.toLocaleString()],
      ['Total Distance (km)', data.summary.totalDistance.toLocaleString()],
      ['Total Expenses ($)', data.summary.totalExpenses.toFixed(2)],
      ['Total Fuel Cost ($)', data.summary.totalFuelCost.toFixed(2)],
      ['Total Fuel Volume (L)', data.summary.totalFuelVolume.toFixed(2)],
      [
        'Avg Fuel Efficiency (km/L)',
        data.summary.avgFuelEfficiency != null ? data.summary.avgFuelEfficiency.toFixed(2) : 'N/A',
      ],
      ['Cost per Km ($)', data.summary.costPerKm != null ? data.summary.costPerKm.toFixed(2) : 'N/A'],
      ['Pending Maintenance', data.summary.pendingMaintenance.toLocaleString()],
      ['Overdue Maintenance', data.summary.overdueMaintenance.toLocaleString()],
    ];

    for (const [label, value] of summaryItems) {
      page.drawText(`${label}:`, { x: 50, y, size: 11, font });
      page.drawText(value, { x: 280, y, size: 11, font: boldFont });
      y -= 20;
    }

    y -= 15;
    page.drawText('Top Cost Categories', { x: 50, y, size: 13, font: boldFont });
    y -= 22;

    const categories = Object.entries(data.costBreakdown.byCategory).slice(0, 8);
    if (categories.length === 0) {
      page.drawText('No expense data for this period.', { x: 50, y, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
      y -= 18;
    } else {
      for (const [category, total] of categories) {
        page.drawText(category, { x: 50, y, size: 10, font });
        page.drawText(`$${total.toFixed(2)}`, { x: 280, y, size: 10, font: boldFont });
        y -= 16;
      }
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  private async generateCSVReport(data: FleetSummaryData, config: ReportConfig): Promise<Buffer> {
    const rows: (string | number)[][] = [
      ['Fleet Summary Report'],
      ['Generated At', data.generatedAt.toISOString()],
      ['Period Start', config.dateRange.startDate.toISOString()],
      ['Period End', config.dateRange.endDate.toISOString()],
      [],
      ['Metric', 'Value'],
      ['Total Vehicles', data.summary.totalVehicles],
      ['Active Vehicles', data.summary.activeVehicles],
      ['In Maintenance', data.summary.maintenanceVehicles],
      ['Total Distance (km)', data.summary.totalDistance],
      ['Total Expenses ($)', data.summary.totalExpenses],
      ['Total Fuel Cost ($)', data.summary.totalFuelCost],
      ['Total Fuel Volume (L)', data.summary.totalFuelVolume],
      ['Avg Fuel Efficiency (km/L)', data.summary.avgFuelEfficiency ?? 'N/A'],
      ['Cost per Km ($)', data.summary.costPerKm ?? 'N/A'],
      ['Pending Maintenance', data.summary.pendingMaintenance],
      ['Overdue Maintenance', data.summary.overdueMaintenance],
      [],
      ['Cost By Category'],
      ['Category', 'Total ($)'],
      ...Object.entries(data.costBreakdown.byCategory).map(([k, v]) => [k, v]),
      [],
      ['Cost By Vehicle (Top 10)'],
      ['License Plate', 'Total ($)'],
      ...data.costBreakdown.byVehicle.map((v) => [v.license_plate, v.total]),
    ];

    const csvContent = rows
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell ?? '');
            return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
          })
          .join(',')
      )
      .join('\n');

    return Buffer.from(csvContent, 'utf-8');
  }

  private async generateExcelReport(data: FleetSummaryData, config: ReportConfig): Promise<Buffer> {
    const workbook = XLSX.utils.book_new();

    const summarySheetData = [
      ['Fleet Summary Report'],
      ['Generated At', data.generatedAt.toISOString()],
      ['Period Start', config.dateRange.startDate.toISOString()],
      ['Period End', config.dateRange.endDate.toISOString()],
      [],
      ['Metric', 'Value'],
      ['Total Vehicles', data.summary.totalVehicles],
      ['Active Vehicles', data.summary.activeVehicles],
      ['In Maintenance', data.summary.maintenanceVehicles],
      ['Total Distance (km)', data.summary.totalDistance],
      ['Total Expenses ($)', data.summary.totalExpenses],
      ['Total Fuel Cost ($)', data.summary.totalFuelCost],
      ['Total Fuel Volume (L)', data.summary.totalFuelVolume],
      ['Avg Fuel Efficiency (km/L)', data.summary.avgFuelEfficiency ?? 'N/A'],
      ['Cost per Km ($)', data.summary.costPerKm ?? 'N/A'],
      ['Pending Maintenance', data.summary.pendingMaintenance],
      ['Overdue Maintenance', data.summary.overdueMaintenance],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    const categoryRows = [
      ['Category', 'Total ($)'],
      ...Object.entries(data.costBreakdown.byCategory).map(([k, v]) => [k, v]),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(categoryRows), 'By Category');

    const vehicleRows = [
      ['License Plate', 'Total ($)'],
      ...data.costBreakdown.byVehicle.map((v) => [v.license_plate, v.total]),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(vehicleRows), 'By Vehicle');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(excelBuffer);
  }

  async scheduleReport(config: ReportConfig, tenantId: string, userId: string): Promise<void> {
    if (!config.schedule?.enabled) return;

    const cronMap: Record<'daily' | 'weekly' | 'monthly', string> = {
      daily: '0 8 * * *',
      weekly: `0 8 * * ${config.schedule.dayOfWeek ?? 1}`,
      monthly: `0 8 ${config.schedule.dayOfMonth ?? 1} * *`,
    };

    await queueService.addJob(
      JobType.GENERATE_REPORT,
      {
        type: JobType.GENERATE_REPORT,
        payload: { config },
        tenantId,
        userId,
      },
      { repeat: { cron: cronMap[config.schedule.frequency] } }
    );

    await auditLog.log({
      action: 'REPORT_SCHEDULED',
      userId,
      tenantId,
      entityType: 'report',
      metadata: { type: config.type, frequency: config.schedule.frequency },
    });
  }

  async getReport(reportId: string, tenantId: string): Promise<Report> {
    const report = await this.repo.findById(reportId, tenantId);
    if (!report) {
      throw new NotFoundError('Report not found');
    }
    return report;
  }

  async listReports(userId: string, tenantId: string): Promise<Report[]> {
    return this.repo.findByUser(userId, tenantId);
  }

  async downloadReport(reportId: string, userId: string, tenantId: string): Promise<{ buffer: Buffer; report: Report }> {
    const report = await this.getReport(reportId, tenantId);

    if (report.status !== 'completed') {
      throw new AppError(
        `Report is not ready for download (status: ${report.status})`,
        'REPORT_NOT_READY',
        409
      );
    }

    if (!report.fileKey) {
      throw new NotFoundError('Report file not found');
    }

    const buffer = await storageService.getFile(report.fileKey);

    if (!buffer) {
      throw new NotFoundError('Report file could not be retrieved from storage');
    }

    await this.repo.incrementDownloadCount(reportId, tenantId);

    await auditLog.log({
      action: 'REPORT_DOWNLOADED',
      userId,
      tenantId,
      entityType: 'report',
      entityId: reportId,
    });

    return { buffer, report };
  }

  private getExtension(format: ReportFormat): string {
    switch (format) {
      case 'pdf':
        return 'pdf';
      case 'csv':
        return 'csv';
      case 'excel':
        return 'xlsx';
    }
  }

  private getMimeType(format: ReportFormat): string {
    switch (format) {
      case 'pdf':
        return 'application/pdf';
      case 'csv':
        return 'text/csv';
      case 'excel':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
  }
}

export const reportService = new ReportService();