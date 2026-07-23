// infrastructure/database/indexes.anomaly-addendum.ts

export const ANOMALY_INDEXES = {
  tblanomalies: [
    {
      key: { tenantId: 1, status: 1, detectedAt: -1 },
      name: 'idx_anomaly_tenant_status_detected',
    },
    {
      key: { tenantId: 1, severity: 1, status: 1 },
      name: 'idx_anomaly_tenant_severity_status',
    },
    {
      key: { tenantId: 1, licensePlate: 1, detectedAt: -1 },
      name: 'idx_anomaly_tenant_plate_detected',
    },
    {
      key: { tenantId: 1, category: 1, detectedAt: -1 },
      name: 'idx_anomaly_tenant_category_detected',
    },
    {
      // Enforces the dedup guarantee at the DB level too, not just in
      // application code: only one OPEN anomaly per fingerprint per
      // tenant may exist at a time.
      key: { tenantId: 1, fingerprint: 1 },
      name: 'idx_anomaly_tenant_fingerprint_open',
      unique: true,
      partialFilterExpression: { status: 'open' },
    },
  ],
} as const;