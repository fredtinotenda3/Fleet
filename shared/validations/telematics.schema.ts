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

export const telematicsIngestSchema = z.object({
  deviceId: z.string().min(1),
  vehicleId: z.string().min(1),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      speed: z.number().nonnegative(),
      heading: z.number(),
      altitude: z.number(),
      accuracy: z.number().nonnegative(),
      timestamp: z.coerce.date(),
    })
    .optional(),
  engine: z.object({
    rpm: z.number().nonnegative(),
    coolantTemp: z.number(),
    fuelLevel: z.number().min(0).max(100),
    throttlePosition: z.number(),
    engineLoad: z.number(),
    dtcCodes: z.array(z.string()).optional(),
  }),
  trip: z.object({
    odometer: z.number().nonnegative(),
    tripDistance: z.number().nonnegative(),
    tripDuration: z.number().nonnegative(),
    averageSpeed: z.number().nonnegative(),
    maxSpeed: z.number().nonnegative(),
    idleTime: z.number().nonnegative(),
  }),
  fuel: z.object({
    consumptionRate: z.number().nonnegative(),
    instantConsumption: z.number().nonnegative(),
    fuelUsed: z.number().nonnegative(),
  }),
  timestamp: z.coerce.date(),
});

export type GeofenceCreateInput = z.infer<typeof geofenceCreateSchema>;
export type GeofenceUpdateInput = z.infer<typeof geofenceUpdateSchema>;
export type TelematicsIngestInput = z.infer<typeof telematicsIngestSchema>;