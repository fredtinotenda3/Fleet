export const DRIVER_INDEXES = {
  tbldrivers: [
    {
      key: { tenantId: 1, status: 1, name: 1 },
      name: 'idx_driver_tenant_status_name',
    },
    {
      key: { tenantId: 1, driver_code: 1 },
      name: 'idx_driver_tenant_code',
      sparse: true,
    },
  ],
} as const;
