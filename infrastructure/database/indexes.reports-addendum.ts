// infrastructure/database/indexes.reports-addendum.ts
//
// Add this entry to the INDEXES map in infrastructure/database/indexes.ts
// (under the existing tblnotifications block) — shown standalone here
// since that file was completed in Batch 15 and shouldn't be re-emitted
// in full just to add one collection.

export const REPORTS_INDEXES = {
  tblreports: [
    {
      key: { tenantId: 1, generatedBy: 1, generatedAt: -1 },
      name: 'idx_report_tenant_user_generated',
    },
    {
      key: { tenantId: 1, status: 1 },
      name: 'idx_report_tenant_status',
    },
    {
      key: { tenantId: 1, type: 1 },
      name: 'idx_report_tenant_type',
    },
    {
      key: { isDeleted: 1, generatedAt: 1 },
      name: 'idx_report_deleted_generated',
    },
  ],
} as const;