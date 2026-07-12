/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/trips/[id]/route.ts
//
// FIX (Critical-adjacent — missing auth entirely): this route had no
// auth check of any kind — not even legacy requireAuth(). Any
// unauthenticated caller could read, update, or delete any trip by ID,
// with no permission or tenant check at the route layer. Converted to
// withAuth + Permission with the async params pattern (Next.js 15
// params is a Promise). Tenant scoping is already enforced inside
// tripController / trip-command.service via getTenantFromRequest.
//
// Permission.TRIP_VIEW / TRIP_EDIT / TRIP_DELETE confirmed against
// server/permissions/roles.ts.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return tripController.getTrip(req, id);
  },
  { permission: Permission.TRIP_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return tripController.updateTrip(req, id);
  },
  { permission: Permission.TRIP_EDIT }
);

export const DELETE = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return tripController.deleteTrip(req, id);
  },
  { permission: Permission.TRIP_DELETE }
);