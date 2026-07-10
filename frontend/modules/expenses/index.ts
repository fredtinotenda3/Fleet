// frontend/modules/expenses/index.ts
export * from './types';
export * from './routes';
export * from './hooks/useExpenses';
export * from './hooks/useExpenseMutations';
export * from './services/expenses.api';
export * from './utils';
export * from './pages';

// Instead of export * from './components', be selective
export { 
  ExpenseForm,
  ExpenseModal,
  ExpensesTable,
  ExpenseStatsCards,
  ExpenseMonthlyTrendChart,
  ExpenseCategoryChart
} from './components';
export type { ExpenseModalMode } from './components';