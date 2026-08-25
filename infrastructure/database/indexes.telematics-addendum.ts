// infrastructure/database/indexes.telematics-addendum.ts
//
// Merge into the INDEXES map in infrastructure/database/indexes.ts.
//
// ---------------------------------------------------------------------
// PHASE 1, F-3 -- WHAT WAS MISSING AND WHY IT MATTERED
// ---------------------------------------------------------------------
// This file previously declared indexes for four collections and left
// SIX with none at all: tbltelematics_eagletrack_links,
// tbltelematics_eagletrack_triggers, tbltelematics_eagletrack_config,
// tbltelematics_cartrack_config, tbltelematics_demo_state and
// tblgeocode_cache. tbltelematics itself had two read indexes, both
// non-unique, and NOTHING covering the tuple its upsert actually
// filters on.
//
// The consequence was not merely slow queries:
//
//   * telematics.repository.ts::bulkUpsertHistoricalReadings upserts on
//     {tenantId, vehicleId, deviceId, timestamp} with $setOnInsert. A
//     Mongo upsert is only atomic against a UNIQUE INDEX. Without one,
//     two concurrent history backfills covering the same window -- two
//     operators, or a retry overlapping its original -- can both miss
//     on the filter and both insert. The in-batch Set dedupe protects
//     within a single call, not across calls. The filter was also
//     entirely unindexed, so every upsert was a collection scan within
//     the tenant.
//
//   * eagletrack-tracker-link.repository.ts::mapByUin builds a
//     uin-keyed Map from every link in the tenant. Two links for one
//     tracker were storable, and the Map silently keeps whichever came
//     last -- so a tracker's readings can move to a different vehicle
//     between two syncs with no error raised anywhere.
//
//   * tblgeocode_cache had no expiry of any kind. It is a CACHE; it
//     grew forever.
//
// Every index below is derived from a real call site, named in its
// comment. Nothing here is speculative.
//
// ---------------------------------------------------------------------
// UNIQUE INDEXES AND SOFT DELETES
// ---------------------------------------------------------------------
// This codebase soft-deletes (`isDeleted`). A plain unique index would
// make a business key unusable forever once a row carrying it was
// deleted. Where a collection soft-deletes AND uniqueness is on a
// business key, the index is PARTIAL on `isDeleted: false`, following
// the precedent already set for vehicle license plates in indexes.ts.
//
// tbltelematics is exempt: readings are append-only and are never
// soft-deleted, so its uniqueness is unconditional. Making it partial
// would leave every row that actually exists unconstrained.

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
    {
      // PHASE 1, F-3 -- THE IDEMPOTENCY KEY.
      //
      // Exactly the filter used by bulkUpsertHistoricalReadings, in the
      // same field order. This is what makes that upsert genuinely
      // idempotent rather than idempotent-in-the-happy-path.
      //
      // NOT partial: telemetry is append-only and never soft-deleted.
      //
      // REQUIRES A DUPLICATE SWEEP before creation on any database that
      // ran the pre-Phase-1 code -- see
      // scripts/dedupe-telemetry-readings.ts. ensureIndexes() reports
      // this failure loudly rather than skipping it, which is correct:
      // a silently-absent uniqueness constraint is the bug being fixed.
      key: { tenantId: 1, vehicleId: 1, deviceId: 1, timestamp: 1 },
      name: 'uniq_telematics_tenant_vehicle_device_ts',
      unique: true,
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
    {
      // PHASE 2: provider identity is now a first-class field, and
      // getEagleTrackUinForVehicle filters {tenantId, vehicleId,
      // providerId} then sorts by createdAt to take the newest tracker
      // fitted to a vehicle. Previously that query was a $regex on
      // deviceId, which no index could serve.
      //
      // NOT unique: a vehicle may legitimately have carried several
      // devices from the same provider over time, and the query's whole
      // purpose is to pick the newest of them.
      key: { tenantId: 1, vehicleId: 1, providerId: 1, createdAt: -1 },
      name: 'idx_device_tenant_vehicle_provider_created',
    },
  ],

  // ─── PHASE 1, F-3: previously unindexed collections ────────────────

  tbltelematics_eagletrack_links: [
    {
      // findByUin filters {tenantId, uin, isDeleted:{$ne:true}};
      // mapByUin builds a uin-keyed Map on every sync.
      //
      // UNIQUE because a tracker maps to exactly one vehicle. Two live
      // links for one uin is not a slow query, it is a silent
      // misattribution.
      //
      // PARTIAL so a tracker can be re-linked after its previous link
      // is soft-deleted.
      key: { tenantId: 1, uin: 1 },
      name: 'uniq_eagletrack_link_tenant_uin',
      unique: true,
      partialFilterExpression: { isDeleted: false },
    },
    {
      // listInScope() filters {tenantId, isDeleted, orgUnitId}, sorts by uin.
      key: { tenantId: 1, orgUnitId: 1, uin: 1 },
      name: 'idx_eagletrack_link_tenant_unit_uin',
    },
  ],

  tbltelematics_eagletrack_triggers: [
    {
      // upsert() filters {tenantId, providerTriggerId}; findByProviderId
      // reads the same key to resolve a vendor alert's triggerId.
      //
      // UNIQUE for the same reason as the link above: the upsert relies
      // on it to be idempotent across concurrent syncs, and a duplicate
      // would mean one vendor trigger resolving to two geofences.
      key: { tenantId: 1, providerTriggerId: 1 },
      name: 'uniq_eagletrack_trigger_tenant_providerid',
      unique: true,
      partialFilterExpression: { isDeleted: false },
    },
    {
      // listInScope() filters tenantId + orgUnitId, sorts {typeCode, name}.
      key: { tenantId: 1, orgUnitId: 1, typeCode: 1, name: 1 },
      name: 'idx_eagletrack_trigger_tenant_unit_type',
    },
  ],

  tbltelematics_eagletrack_config: [
    {
      // One config per tenant. Every accessor filters {tenantId} alone
      // and several upsert on it, so uniqueness is what prevents a
      // second config row appearing under a race and then being
      // silently ignored by findOne.
      //
      // NOT partial: configs are not soft-deleted (disabling is
      // `enabled:false`, which must still occupy the tenant's slot).
      key: { tenantId: 1 },
      name: 'uniq_eagletrack_config_tenant',
      unique: true,
    },
    {
      // listEnabledTenantIds() scans {enabled:true} to drive the cron.
      key: { enabled: 1 },
      name: 'idx_eagletrack_config_enabled',
    },
  ],

  tbltelematics_cartrack_config: [
    {
      // Same shape and same reasoning as the Eagle Track config above.
      key: { tenantId: 1 },
      name: 'uniq_cartrack_config_tenant',
      unique: true,
    },
    {
      key: { enabled: 1 },
      name: 'idx_cartrack_config_enabled',
    },
  ],

  tbltelematics_demo_state: [
    {
      // Read and upserted on {tenantId} only. Unique so the per-tenant
      // demo throttle cannot be defeated by a duplicate row appearing
      // under concurrent map loads.
      key: { tenantId: 1 },
      name: 'uniq_demo_state_tenant',
      unique: true,
    },
  ],

  tblgeocode_cache: [
    {
      // get() filters {tenantId, cell}; put() upserts on the same pair.
      //
      // The cache is deliberately TENANT-SCOPED rather than global: a
      // shared coordinate cache is a cross-tenant movement-inference
      // channel, since tenant B could learn that tenant A's vehicles
      // visited a location by observing which cells are already warm.
      // That is why tenantId leads the key.
      key: { tenantId: 1, cell: 1 },
      name: 'uniq_geocode_cache_tenant_cell',
      unique: true,
    },
    {
      // PHASE 1, F-3 -- TTL. This collection had no expiry at all.
      //
      // Keyed on `resolvedAt`, the entry's own timestamp (there is no
      // createdAt on GeocodeCacheEntry). put() uses `$set: entry`, so
      // resolvedAt refreshes on every re-resolution and the TTL
      // measures time since the address was last confirmed rather than
      // since the cell was first seen -- which is what a cache wants.
      //
      // 90 DAYS. Reverse-geocoded addresses are near-static: roads are
      // renamed and premises change occupancy over months, not days.
      // The cost of a stale entry is an outdated address label on a map
      // popup. The cost of too short a TTL is repeated calls to
      // Nominatim -- a free public service, used here with no API key
      // and a strict usage policy, where over-use risks the whole
      // deployment being blocked. 90 days keeps the hit rate high while
      // bounding the collection to the distinct cells a fleet actually
      // visits in a quarter.
      //
      // This is the ONE retention-shaped change in Phase 1, included
      // because F-3 names it explicitly and because a cache without
      // expiry is a defect in the cache itself. tbltelematics retention
      // is untouched and remains Phase 4.
      key: { resolvedAt: 1 },
      name: 'ttl_geocode_cache_resolved_at',
      expireAfterSeconds: 90 * 24 * 60 * 60,
    },
  ],
} as const;
