// frontend/modules/fuel/services/fuelIntelligence.api.ts
//
// Client for GET /api/fuel/monthly-intelligence-report (see
// modules/fuel/controllers/fuel-intelligence.controller.ts). Kept as
// its own service file rather than added to fuel.api.ts -- that file
// is scoped to /api/fuellogs, a different route entirely, and this
// endpoint's three response shapes (JSON envelope, XLSX blob, PDF
// blob) don't fit its existing helpers cleanly.
//
// Same two request shapes as the rest of the app: apiClient.get<T>
// for the JSON report (unwrapped from the ApiResponse envelope), and
// apiClient.getBlob for the file downloads -- identical pattern to
// fuelApi.exportFile / shared/utils/export-download.utils.ts's
// triggerExport, reused here rather than re-implemented.

import { apiClient } from '@/shared/utils/api-client.utils';
import { downloadBlob } from '@/shared/utils/file-download.utils';
import type { MonthlyFuelIntelligenceReport } from '../types';

const BASE = '/api/fuel/monthly-intelligence-report';

function assertMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(`Invalid report month "${month}" -- expected "YYYY-MM".`);
  }
}

export const fuelIntelligenceApi = {
  async getReport(month: string): Promise<MonthlyFuelIntelligenceReport> {
    assertMonth(month);
    return apiClient.get<MonthlyFuelIntelligenceReport>(BASE, {
      params: { month, format: 'json' },
    });
  },

  /** Downloads the Excel workbook and saves it via the browser -- no return value, matching fuelApi's file-producing calls. */
  async downloadExcel(month: string): Promise<void> {
    assertMonth(month);
    const { blob, filename } = await apiClient.getBlob(BASE, {
      params: { month, format: 'excel' },
    });
    downloadBlob(blob, filename ?? `fuel-intelligence-report-${month}.xlsx`);
  },

  /** Downloads the narrative PDF report and saves it via the browser. */
  async downloadPdf(month: string): Promise<void> {
    assertMonth(month);
    const { blob, filename } = await apiClient.getBlob(BASE, {
      params: { month, format: 'pdf' },
    });
    downloadBlob(blob, filename ?? `fuel-intelligence-report-${month}.pdf`);
  },
};

export default fuelIntelligenceApi;
