// infrastructure/database/indexes.telematics-addendum.ts
//
// Merge into the INDEXES map in infrastructure/database/indexes.ts.

export const TELEMATICS_INDEXES = {
  tbltelematics: [
    {
      key: { tenantId: 1, vehicleId: 1, timestamp: -1 },
      name: 'idx_telematics_tenant_vehicle_ts',
    },
    {
      key: { tenantId: 1, deviceId: 1, timestamp: -1 },
      name: 'idx_telematics_tenant_device_ts',
    },
  ],
  tbltelematics_alerts: [
    {
      key: { tenantId: 1, vehicleId: 1, acknowledgedAt: 1 },
      name: 'idx_alert_tenant_vehicle_ack',
    },
    {
      key: { tenantId: 1, severity: 1 },
      name: 'idx_alert_tenant_severity',
    },
  ],
  tbltelematics_geofences: [
    {
      key: { tenantId: 1, active: 1 },
      name: 'idx_geofence_tenant_active',
    },
    {
      key: { tenantId: 1, vehicleId: 1 },
      name: 'idx_geofence_tenant_vehicle',
    },
  ],
  tbltelematics_geofence_states: [
    {
      key: { vehicleId: 1, geofenceId: 1 },
      name: 'idx_geofence_state_vehicle_geofence',
      unique: true,
    },
  ],
  tbltelematics_devices: [
    {
      key: { tenantId: 1, deviceId: 1 },
      name: 'idx_device_tenant_deviceid',
      unique: true,
    },
    {
      key: { tenantId: 1, status: 1, lastPingAt: 1 },
      name: 'idx_device_tenant_status_ping',
    },
  ],
} as const;