// app/api/geocoding/search/route.ts
//
// GET /api/geocoding/search?q=<text> -- forward geocoding for the
// map-assisted trip log's location search box (PART 3). Gated on
// TRIP_CREATE: the only feature that calls this today is trip entry,
// and a caller who may not create a trip has no use for it.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { geocodingController } from '@/modules/telematics/controllers/geocoding.controller';

export const GET = withAuth(
  async (req: NextRequest) => geocodingController.search(req),
  { permission: Permission.TRIP_CREATE }
);
