// infrastructure/database/indexes.reporting-addendum.ts
//
// NEW (High — performance/data integrity gap found during the Reports
// audit): infrastructure/database/indexes.reports-addendum.ts only
// indexes the legacy `tblreports` collection (modules/reports, now
// removed — see the Reports Center audit notes). The Enterprise
// Reporting Platform's five collections (registered via
// BaseRepository.collectionName in modules/reporting/repositories/*.ts)
// had no index definitions anywhere:
//   - tbldashboards
//   - tblkpidefinitions
//   - tblreportdefinitions
//   - tblreportexecutions
//   - tblreporttemplates
// Every list-by-tenant, "executive dashboards only", "system templates",
// and "user's executions, paginated + sorted by generatedAt" query was
// running as a full collection scan. Add this entry to the INDEXES map
// in infrastructure/database/indexes.ts, the same way the reports
// addendum was documented to be merged in.

export const REPORTING_INDEXES = {
  tbldashboards: [
    {
      key: { tenantId: 1, isDeleted: 1 },
      name: 'idx_dashboard_tenant_active',
    },
    {
      key: { tenantId: 1, isExecutive: 1, isDeleted: 1 },
      name: 'idx_dashboard_tenant_executive',
    },
  ],
  tblkpidefinitions: [
    {
      key: { tenantId: 1, isDeleted: 1 },
      name: 'idx_kpi_tenant_active',
    },
    {
      key: { tenantId: 1, dataSource: 1 },
      name: 'idx_kpi_tenant_datasource',
    },
  ],
  tblreportdefinitions: [
    {
      key: { tenantId: 1, isDeleted: 1 },
      name: 'idx_reportdef_tenant_active',
    },
    {
      key: { tenantId: 1, dataSource: 1 },
      name: 'idx_reportdef_tenant_datasource',
    },
    {
      key: { 'schedule.enabled': 1, tenantId: 1 },
      name: 'idx_reportdef_scheduled',
    },
  ],
  tblreportexecutions: [
    {
      key: { tenantId: 1, generatedAt: -1 },
      name: 'idx_execution_tenant_generated',
    },
    {
      key: { tenantId: 1, generatedBy: 1, generatedAt: -1 },
      name: 'idx_execution_tenant_user_generated',
    },
    {
      key: { tenantId: 1, status: 1 },
      name: 'idx_execution_tenant_status',
    },
    {
      key: { reportDefinitionId: 1 },
      name: 'idx_execution_report_definition',
      sparse: true,
    },
    {
      key: { dashboardId: 1 },
      name: 'idx_execution_dashboard',
      sparse: true,
    },
  ],
  tblreporttemplates: [
    {
      key: { tenantId: 1, isSystemTemplate: 1 },
      name: 'idx_template_tenant_system',
    },
    {
      key: { category: 1 },
      name: 'idx_template_category',
    },
  ],
} as const;