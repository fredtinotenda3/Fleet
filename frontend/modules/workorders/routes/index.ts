// frontend/modules/workorders/routes/index.ts

export const WORKORDER_ROUTES = {
  list: '/workorders',
  detail: (id: string) => `/workorders/${id}`,
  /** Deep link used by the Command Centre / DVIR notifications (see needs-attention.service.ts and dvir.service.ts). */
  byLicensePlate: (licensePlate: string) => `/workorders?license_plate=${encodeURIComponent(licensePlate)}`,
  /** R.3.6 -- drill-down target from WorkOrderReports.tsx's status chart. See WorkOrderListPage's `?status=` handling. */
  byStatus: (status: string) => `/workorders?status=${encodeURIComponent(status)}`,
  /** R.3.6 -- drill-down target from WorkOrderReports.tsx's priority chart. See WorkOrderListPage's `?priority=` handling. */
  byPriority: (priority: string) => `/workorders?priority=${encodeURIComponent(priority)}`,
} as const;