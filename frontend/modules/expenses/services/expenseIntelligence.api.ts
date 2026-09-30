// frontend/modules/expenses/services/expenseIntelligence.api.ts
//
// Client for GET /api/expenses/monthly-intelligence-report (see
// modules/expenses/controllers/expense-intelligence.controller.ts).
// Kept as its own service file rather than added to expenses.api.ts --
// that file is scoped to /api/expenses, a different route entirely --
// mirroring frontend/modules/fuel/services/fuelIntelligence.api.ts's
// own precedent for the same reasoning.
//
// BACKEND-ONLY PHASE: only `getReport` (format=json) is wired up here.
// `downloadExcel`/`downloadPdf` are deliberately NOT added yet -- the
// backend's excel/pdf formats currently return 501 Not Implemented
// (see the controller's header), so adding download buttons that lead
// to a guaranteed error would be worse than not offering them. Add
// these two methods, mirroring fuelIntelligenceApi.downloadExcel/
// downloadPdf exactly, once modules/expenses/reporting's Excel/PDF
// generators exist.

import { apiClient } from '@/shared/utils/api-client.utils';
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
};

export default expenseIntelligenceApi;
