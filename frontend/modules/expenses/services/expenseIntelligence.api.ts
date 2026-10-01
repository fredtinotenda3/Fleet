// frontend/modules/expenses/services/expenseIntelligence.api.ts
//
// Client for GET /api/expenses/monthly-intelligence-report (see
// modules/expenses/controllers/expense-intelligence.controller.ts).
// Kept as its own service file rather than added to expenses.api.ts --
// that file is scoped to /api/expenses, a different route entirely --
// mirroring frontend/modules/fuel/services/fuelIntelligence.api.ts's
// own precedent for the same reasoning.
//
// Same two request shapes as the rest of the app: apiClient.get<T> for
// the JSON report, and apiClient.getBlob for the file downloads --
// identical pattern to fuelIntelligenceApi's downloadExcel/downloadPdf.

import { apiClient } from '@/shared/utils/api-client.utils';
import { downloadBlob } from '@/shared/utils/file-download.utils';
import type { MonthlyExpenseIntelligenceReport } from '../types';

const BASE = '/api/expenses/monthly-intelligence-report';

function assertMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(`Invalid report month "${month}" -- expected "YYYY-MM".`);
  }
}

export const expenseIntelligenceApi = {
  async getReport(month: string): Promise<MonthlyExpenseIntelligenceReport> {
    assertMonth(month);
    return apiClient.get<MonthlyExpenseIntelligenceReport>(BASE, {
      params: { month, format: 'json' },
    });
  },

  /** Downloads the Excel workbook and saves it via the browser -- no return value, matching expenseApi's file-producing calls. */
  async downloadExcel(month: string): Promise<void> {
    assertMonth(month);
    const { blob, filename } = await apiClient.getBlob(BASE, {
      params: { month, format: 'excel' },
    });
    downloadBlob(blob, filename ?? `expense-intelligence-report-${month}.xlsx`);
  },

  /** Downloads the narrative PDF report and saves it via the browser. */
  async downloadPdf(month: string): Promise<void> {
    assertMonth(month);
    const { blob, filename } = await apiClient.getBlob(BASE, {
      params: { month, format: 'pdf' },
    });
    downloadBlob(blob, filename ?? `expense-intelligence-report-${month}.pdf`);
  },
};

export default expenseIntelligenceApi;
