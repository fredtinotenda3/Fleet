// app/(protected)/reports/workorders/page.tsx
//
// R.3.6 -- Work Order Reporting. This route sits under the existing
// /reports/* section (ReportsLayout gates the whole section on
// REPORT_VIEW) -- WorkOrderReports.tsx itself additionally handles the
// WORKORDER_VIEW-specific 403 as a page-level Restricted state, since
// REPORT_VIEW alone does not imply WORKORDER_VIEW (see that page's
// header comment).
import WorkOrderReports from '@/frontend/modules/reports/pages/WorkOrderReports';

export default function WorkOrderReportsRoute() {
  return <WorkOrderReports />;
}
