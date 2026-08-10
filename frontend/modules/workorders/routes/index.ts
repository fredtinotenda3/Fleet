// frontend/modules/workorders/routes/index.ts

export const WORKORDER_ROUTES = {
  list: '/workorders',
  detail: (id: string) => `/workorders/${id}`,
  /** Deep link used by the Command Centre / DVIR notifications (see needs-attention.service.ts and dvir.service.ts). */
  byLicensePlate: (licensePlate: string) => `/workorders?license_plate=${encodeURIComponent(licensePlate)}`,
} as const;