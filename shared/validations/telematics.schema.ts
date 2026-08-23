// shared/validations/telematics.schema.ts

import { z } from 'zod';

const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const circleCoordinatesSchema = z.object({
  center: latLngSchema,
  radius: z.number().positive('Radius must be positive (meters)'),
});

const polygonCoordinatesSchema = z.object({
  points: z.array(latLngSchema).min(3, 'Polygon requires at least 3 points'),
});

const routeCoordinatesSchema = z.object({
  points: z.array(latLngSchema).min(2, 'Route requires at least 2 points'),
  tolerance: z.number().positive('Tolerance must be positive (meters)'),
});

export const geofenceCreateSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100),
    vehicleId: z.string().optional(),
    type: z.enum(['circle', 'polygon', 'route']),
    coordinates: z.union([
      circleCoordinatesSchema,
      polygonCoordinatesSchema,
      routeCoordinatesSchema,
    ]),
    active: z.boolean().default(true),
    alerts: z.object({
      entry: z.boolean().default(true),
      exit: z.boolean().default(true),
      inside: z.boolean().default(false),
    }),
    schedule: z
      .object({
        startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
        endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
        daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'circle' && !('center' in data.coordinates)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Circle geofence requires center/radius coordinates',
        path: ['coordinates'],
      });
    }
    if (data.type === 'polygon' && !('points' in data.coordinates && !('tolerance' in data.coordinates))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Polygon geofence requires points coordinates',
        path: ['coordinates'],
      });
    }
    if (data.type === 'route' && !('tolerance' in data.coordinates)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Route geofence requires points/tolerance coordinates',
        path: ['coordinates'],
      });
    }
  });

export const geofenceUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  active: z.boolean().optional(),
  alerts: z
    .object({
      entry: z.boolean().optional(),
      exit: z.boolean().optional(),
      inside: z.boolean().optional(),
    })
    .partial()
    .optional(),
  schedule: z
    .object({
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      daysOfWeek: z.array(z.number().int().min(0).max(6)),
    })
    .optional()
    .nullable(),
});

/**
 * PHASE 0, F-5 -- hardened ingest contract.
 *
 * THREE CHANGES, EACH FOR A SPECIFIC REASON.
 *
 * 1. `.strict()`. The controller derives tenantId and orgUnitId from
 *    the authoritative vehicle record, but a permissive schema would
 *    still silently ACCEPT `tenantId`/`orgUnitId` keys in the body and
 *    carry them into the object it spreads. Strict mode turns a forged
 *    ownership key into a 400 at the boundary rather than relying on
 *    every downstream spread being in the right order forever. It also
 *    rejects `_id`, `isDeleted`, and anything else a caller invents.
 *
 * 2. MEASUREMENT MEMBERS ARE NOW OPTIONAL, matching
 *    modules/telematics/types/telematics.types.ts. Previously every
 *    engine/trip/fuel field was REQUIRED, which did not prevent
 *    fabrication -- it MANDATED it: a device with no RPM sensor had no
 *    way to express "not reported" and had to send `rpm: 0`. That is
 *    the same absent-vs-zero defect as the adapter one, relocated to
 *    the caller. A fabricated `fuelLevel: 0` reaches
 *    telematicsService.checkForAlerts' `< 10` branch and manufactures a
 *    high-severity low-fuel alert plus a manager notification on every
 *    single post; a fabricated `odometer: 0` WINS over the vehicle's
 *    real odometer in digital-twin's `?? ` fallback chain. The
 *    containers stay required so existing readers (`data.engine?.x`)
 *    keep their shape -- an ingester with no engine signals sends `{}`.
 *
 * 3. BOUNDED TIMESTAMPS. An unbounded `z.coerce.date()` accepts the
 *    year 9999, which would park a reading permanently at the head of
 *    every `timestamp: -1` index and permanently defeat the staleness
 *    guards that ask "is this newer than what I hold". Clamped to a
 *    generous window rather than a tight one: real devices legitimately
 *    buffer while out of coverage and dump on reconnect, so a narrow
 *    "must be recent" rule would discard exactly the data that matters.
 */
const MAX_TIMESTAMP_SKEW_FUTURE_MS = 24 * 60 * 60 * 1000; // 1 day
const MAX_TIMESTAMP_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

const ingestTimestamp = z.coerce.date().refine(
  (d) => {
    const t = d.getTime();
    if (Number.isNaN(t)) return false;
    const now = Date.now();
    return t <= now + MAX_TIMESTAMP_SKEW_FUTURE_MS && t >= now - MAX_TIMESTAMP_AGE_MS;
  },
  { message: 'timestamp must be within the last year and not more than 1 day in the future' }
);

export const telematicsIngestSchema = z
  .object({
    deviceId: z.string().min(1),
    vehicleId: z.string().min(1),
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        speed: z.number().nonnegative().max(400),
        // Optional for the same reason as the domain type: 0 is due
        // north, so a substituted 0 points every non-reporting
        // vehicle's arrow the same wrong way.
        heading: z.number().min(0).max(360).optional(),
        altitude: z.number(),
        accuracy: z.number().nonnegative(),
        timestamp: ingestTimestamp,
      })
      .strict()
      .optional(),
    engine: z
      .object({
        rpm: z.number().nonnegative().max(20_000).optional(),
        coolantTemp: z.number().min(-100).max(500).optional(),
        fuelLevel: z.number().min(0).max(100).optional(),
        throttlePosition: z.number().min(0).max(100).optional(),
        engineLoad: z.number().min(0).max(100).optional(),
        dtcCodes: z.array(z.string().max(16)).max(64).optional(),
      })
      .strict(),
    trip: z
      .object({
        odometer: z.number().nonnegative().max(10_000_000).optional(),
        tripDistance: z.number().nonnegative().optional(),
        tripDuration: z.number().nonnegative().optional(),
        averageSpeed: z.number().nonnegative().max(400).optional(),
        maxSpeed: z.number().nonnegative().max(400).optional(),
        idleTime: z.number().nonnegative().optional(),
      })
      .strict(),
    fuel: z
      .object({
        consumptionRate: z.number().nonnegative().optional(),
        instantConsumption: z.number().nonnegative().optional(),
        fuelUsed: z.number().nonnegative().optional(),
      })
      .strict(),
    timestamp: ingestTimestamp,
  })
  .strict();

export type GeofenceCreateInput = z.infer<typeof geofenceCreateSchema>;
export type GeofenceUpdateInput = z.infer<typeof geofenceUpdateSchema>;
export type TelematicsIngestInput = z.infer<typeof telematicsIngestSchema>;