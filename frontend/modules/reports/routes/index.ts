// frontend/modules/reports/routes/index.ts
// Central route table for the Reports module. Import these constants instead
// of hardcoding path strings so refactors to the app router don't silently
// break links, redirects, or breadcrumbs.

export const REPORTS_ROUTES = {
  root: '/reports',
  executive: '/reports',
  builder: {
    root: '/reports/builder',
    new: '/reports/builder',
    edit: (reportId: string) => `/reports/builder/${reportId}`,
  },
  exports: '/reports/exports',
  scheduled: '/reports/scheduled',
} as const;

export type ReportsRoute = typeof REPORTS_ROUTES;