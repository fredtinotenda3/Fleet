// modules/reports/services/report.service.ts

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { storageService } from '@/infrastructure/storage/storage.service';
import { queueService, JobType } from '@/infrastructure/queue/queue.service';

export interface ReportConfig {
  type: 'fleet_summary' | 'expense_analysis' | 'fuel_efficiency' | 'maintenance_history' | 'trip_logs';
  format: 'pdf' | 'csv' | 'excel';
  dateRange: { startDate: Date; endDate: Date };
  filters?: Record<string, any>;
  includeCharts?: boolean;
  includeDetails?: boolean;
  tenantId: string;
  userId: string;
  schedule?: {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly';
    dayOfWeek?: number;
    dayOfMonth?: number;
    recipients: string[];
  };
}

export interface Report {
  _id?: string;
  name: string;
  type: string;
  format: string;
  fileUrl: string;
  fileSize: number;
  generatedAt: Date;
  generatedBy: string;
  tenantId: string;
  dateRange: { startDate: Date; endDate: Date };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadCount: number;
}

export class ReportService {
  async generateReport(config: ReportConfig): Promise<Report> {
    const reportId = crypto.randomUUID();
    
    // Queue the report generation
    await queueService.addJob(JobType.GENERATE_REPORT, {
      type: JobType.GENERATE_REPORT,
      payload: { config, reportId },
      tenantId: config.tenantId,
      userId: config.userId,
    });
    
    return {
      _id: reportId,
      name: `${config.type}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}`,
      type: config.type,
      format: config.format,
      fileUrl: '',
      fileSize: 0,
      generatedAt: new Date(),
      generatedBy: config.userId,
      tenantId: config.tenantId,
      dateRange: config.dateRange,
      status: 'pending',
      downloadCount: 0,
    };
  }
  
  async generateFleetSummaryReport(config: ReportConfig): Promise<Buffer> {
    // This would aggregate data from multiple services
    const data = {
      generatedAt: new Date(),
      dateRange: config.dateRange,
      summary: {
        totalVehicles: 0,
        activeVehicles: 0,
        totalDistance: 0,
        totalExpenses: 0,
        totalFuel: 0,
        avgFuelEfficiency: 0,
      },
      vehicles: [],
      expenses: [],
      fuelLogs: [],
      maintenance: [],
    };
    
    if (config.format === 'pdf') {
      return this.generatePDFReport(data, config);
    } else if (config.format === 'csv') {
      return this.generateCSVReport(data, config);
    } else {
      return this.generateExcelReport(data, config);
    }
  }
  
  private async generatePDFReport(data: any, config: ReportConfig): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    
    let page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();
    
    // Title
    page.drawText('Fleet Summary Report', {
      x: 50,
      y: height - 50,
      size: 18,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });
    
    // Date range
    page.drawText(`Period: ${format(config.dateRange.startDate, 'MMM dd, yyyy')} - ${format(config.dateRange.endDate, 'MMM dd, yyyy')}`, {
      x: 50,
      y: height - 80,
      size: 10,
      font: timesRomanFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    // Summary section
    let yPosition = height - 120;
    
    const summaryItems = [
      { label: 'Total Vehicles', value: data.summary.totalVehicles },
      { label: 'Active Vehicles', value: data.summary.activeVehicles },
      { label: 'Total Distance (km)', value: data.summary.totalDistance.toLocaleString() },
      { label: 'Total Expenses ($)', value: data.summary.totalExpenses.toLocaleString() },
      { label: 'Total Fuel (L)', value: data.summary.totalFuel.toLocaleString() },
      { label: 'Avg Fuel Efficiency (km/L)', value: data.summary.avgFuelEfficiency.toFixed(2) },
    ];
    
    for (const item of summaryItems) {
      page.drawText(`${item.label}: ${item.value}`, {
        x: 50,
        y: yPosition,
        size: 11,
        font: timesRomanFont,
      });
      yPosition -= 20;
    }
    
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
  
  private async generateCSVReport(data: any, config: ReportConfig): Promise<Buffer> {
    const rows = [
      ['Generated At', new Date().toISOString()],
      ['Period Start', config.dateRange.startDate.toISOString()],
      ['Period End', config.dateRange.endDate.toISOString()],
      [],
      ['Metric', 'Value'],
      ['Total Vehicles', data.summary.totalVehicles],
      ['Active Vehicles', data.summary.activeVehicles],
      ['Total Distance (km)', data.summary.totalDistance],
      ['Total Expenses ($)', data.summary.totalExpenses],
      ['Total Fuel (L)', data.summary.totalFuel],
      ['Avg Fuel Efficiency (km/L)', data.summary.avgFuelEfficiency],
    ];
    
    const csvContent = rows.map(row => row.join(',')).join('\n');
    return Buffer.from(csvContent, 'utf-8');
  }
  
  private async generateExcelReport(data: any, config: ReportConfig): Promise<Buffer> {
    const workbook = XLSX.utils.book_new();
    
    // Summary sheet
    const summaryData = [
      ['Generated At', new Date().toISOString()],
      ['Period Start', config.dateRange.startDate],
      ['Period End', config.dateRange.endDate],
      [],
      ['Metric', 'Value'],
      ['Total Vehicles', data.summary.totalVehicles],
      ['Active Vehicles', data.summary.activeVehicles],
      ['Total Distance (km)', data.summary.totalDistance],
      ['Total Expenses ($)', data.summary.totalExpenses],
      ['Total Fuel (L)', data.summary.totalFuel],
      ['Avg Fuel Efficiency (km/L)', data.summary.avgFuelEfficiency],
    ];
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(excelBuffer);
  }
  
  async scheduleReport(config: ReportConfig): Promise<void> {
    if (!config.schedule?.enabled) return;
    
    const cronMap = {
      daily: '0 8 * * *',
      weekly: `0 8 * * ${config.schedule.dayOfWeek || 1}`,
      monthly: `0 8 ${config.schedule.dayOfMonth || 1} * *`,
    };
    
    await queueService.addJob(JobType.GENERATE_REPORT, {
      type: JobType.GENERATE_REPORT,
      payload: { config },
      tenantId: config.tenantId,
      userId: config.userId,
    }, {
      repeat: { cron: cronMap[config.schedule.frequency] },
    });
  }
  
  async downloadReport(reportId: string, userId: string, tenantId: string): Promise<Buffer> {
    // Increment download count
    // Retrieve file from storage
    // Return file buffer
    return Buffer.from('');
  }
}

export const reportService = new ReportService();