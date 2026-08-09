// modules/finance/types/finance-currency.addendum.ts
//
// Adds multi-currency fields to the three transaction sources the
// allocation ledger draws from: expenses, fuel logs, and maintenance
// reminders. A tenant operating across borders logs costs in whatever
// currency they were actually paid in (currency); fx_rate/fx_rate_date/
// fx_source record how that was converted, and reporting_amount is the
// converted figure the tenant's dashboards and the GL reconciliation
// report actually sum. All fields optional and additive -- existing
// rows and every current importer of Expense/FuelLog/Reminder keep
// compiling unchanged; a record with none of these fields is simply
// assumed to already be in the tenant's reporting currency (fx_rate 1).
//
// FuelLog already declared `currency?: string` before this pass (see
// shared/types/fuel.types.ts); it is not redeclared here, only the
// fx_* and reporting_amount fields it was missing.

import '@/shared/types/expense.types';
import '@/shared/types/fuel.types';
import '@/shared/types/maintenance.types';
import type { FxSource } from './allocation.types';

declare module '@/shared/types/expense.types' {
  interface Expense {
    currency?: string;
    fx_rate?: number;
    fx_rate_date?: Date;
    fx_source?: FxSource;
    /** amount converted to the tenant's reporting currency (OrganizationFinanceSettings.reportingCurrency). */
    reporting_amount?: number;
  }
}

declare module '@/shared/types/fuel.types' {
  interface FuelLog {
    fx_rate?: number;
    fx_rate_date?: Date;
    fx_source?: FxSource;
    /** cost converted to the tenant's reporting currency. */
    reporting_amount?: number;
  }
}

declare module '@/shared/types/maintenance.types' {
  interface Reminder {
    currency?: string;
    fx_rate?: number;
    fx_rate_date?: Date;
    fx_source?: FxSource;
    /** estimated_cost (or the eventual actual cost) converted to the tenant's reporting currency. */
    reporting_amount?: number;
  }
}