// infrastructure/database/indexes.trip-generation-addendum.ts
//
// Indexes for telemetry-derived trip generation.
//
// Merged into the main map in indexes.ts, the same way
// indexes.telematics-addendum.ts is.

export const TRIP_GENERATION_INDEXES = {
  tbltrips: [
    {
      /**
       * THE IDEMPOTENCY GUARANTEE for generated trips.
       *
       * The detector's watermark is an optimisation -- it stops the
       * sweep reprocessing readings it has already seen. It is NOT a
       * guarantee: the state document can be deleted, a sweep can crash
       * between writing trips and saving state, and an operator can
       * deliberately re-run generation from scratch after a detection
       * fix. In every one of those cases this index is what stops a
       * second row appearing for the same journey.
       *
       * PARTIAL, on `generation_key` existing. This is the load-bearing
       * detail: manual and imported trips have no generation_key, and
       * two of them may legitimately share a tenant and a start time
       * (two vehicles leaving a depot together, or a spreadsheet with a
       * date column and no clock). A non-partial unique index on a
       * mostly-absent field would collapse every such trip into one and
       * reject the rest -- turning an idempotency guard into data loss
       * on the manual entry path.
       *
       * `tenantId` first so it can never span tenants, matching the
       * upsert filter in TripGenerationService.persist exactly.
       */
      key: { tenantId: 1, generation_key: 1 },
      name: 'uniq_trips_tenant_generation_key',
      unique: true,
      partialFilterExpression: { generation_key: { $exists: true } },
    },
    {
      /**
       * Route playback and the trip timeline both query by vehicle over
       * a time window. Without this the playback endpoint scans every
       * trip in the tenant to find one vehicle's day.
       */
      key: { tenantId: 1, generation_vehicle_id: 1, start_time: -1 },
      name: 'idx_trips_tenant_vehicle_start',
    },
  ],

  tbltrip_detection_state: [
    {
      /**
       * One state document per vehicle per tenant, and the sweep reads
       * it by exactly this key on every vehicle on every run.
       *
       * Unique rather than merely indexed: two state documents for one
       * vehicle would mean two watermarks, and whichever the sweep
       * happened to read would silently reprocess or skip readings.
       */
      key: { tenantId: 1, vehicleId: 1 },
      name: 'uniq_trip_detection_state_tenant_vehicle',
      unique: true,
    },
  ],
};
